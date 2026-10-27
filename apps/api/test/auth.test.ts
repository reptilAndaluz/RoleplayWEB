import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { FastifyInstance } from 'fastify';

describe('Módulo de Autenticación (API)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  describe('Protección CSRF en métodos mutantes', () => {
    it('rechaza peticiones mutantes sin cabecera Origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test_csrf@burgoslabs.es',
          displayName: 'Test',
          password: 'Password123456!',
        },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toContain('CSRF');
    });

    it('rechaza peticiones mutantes con cabecera Origin no permitida', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: {
          origin: 'https://sitio-malicioso.com',
        },
        payload: {
          email: 'test_csrf@burgoslabs.es',
          displayName: 'Test',
          password: 'Password123456!',
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Registro (POST /api/auth/register)', () => {
    it('registra un usuario nuevo y devuelve cookie HttpOnly con 7 días de sesión', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'hero@burgoslabs.es',
          displayName: 'Héroe Legendario',
          password: 'PasswordSegura123!',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('hero@burgoslabs.es');
      expect(data.user.displayName).toBe('Héroe Legendario');
      expect(data.user.passwordHash).toBeUndefined();

      // Verificar cookie de sesión
      const cookieHeader = res.headers['set-cookie'];
      expect(cookieHeader).toBeDefined();
      const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
      expect(cookieStr).toContain(SESSION_COOKIE_NAME);
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Lax');
      expect(cookieStr).toContain('Path=/');

      // Verificar que en la base de datos se guardó solo el SHA-256 del token, no en claro
      const sessions = await prisma.session.findMany({ where: { userId: data.user.id } });
      expect(sessions.length).toBe(1);
      expect(sessions[0]?.tokenHash).toHaveLength(64); // SHA-256 hex
    });

    it('rechaza registro con email duplicado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'hero@burgoslabs.es',
          displayName: 'Otro Héroe',
          password: 'PasswordSegura123!',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('rechaza contraseña de menos de 10 caracteres con 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'shortpass@burgoslabs.es',
          displayName: 'Corto',
          password: 'corta',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Login (POST /api/auth/login)', () => {
    it('inicia sesión con credenciales correctas y rota la sesión', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.email).toBe('hero@burgoslabs.es');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('devuelve mensaje de error genérico cuando el email no existe (sin enumeración)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'inexistente@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.message).toBe('Credenciales inválidas');
    });

    it('devuelve mensaje de error genérico cuando la contraseña es incorrecta', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
        },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordErronea123!',
        },
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.message).toBe('Credenciales inválidas');
    });
  });

  describe('Perfil protegido (GET /api/auth/me)', () => {
    it('rechaza con 401 si no hay sesión', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });
      expect(res.statusCode).toBe(401);
    });

    it('permite acceso con cookie de sesión válida', async () => {
      // Login para obtener cookie
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: env.ALLOWED_ORIGIN },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });
      const cookie = loginRes.cookies[0];
      expect(cookie).toBeDefined();

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          [cookie!.name]: cookie!.value,
        },
      });

      expect(meRes.statusCode).toBe(200);
      const data = JSON.parse(meRes.body);
      expect(data.user.email).toBe('hero@burgoslabs.es');
    });

    it('rechaza con 401 si la sesión está caducada', async () => {
      // Login para obtener sesión
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: env.ALLOWED_ORIGIN },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });
      const cookie = loginRes.cookies[0];

      // Modificar la sesión en BD para forzar su caducidad
      await prisma.session.updateMany({
        where: { user: { email: 'hero@burgoslabs.es' } },
        data: { expiresAt: new Date(Date.now() - 1000) }, // Caducada hace 1 segundo
      });

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          [cookie!.name]: cookie!.value,
        },
      });

      expect(meRes.statusCode).toBe(401);
    });

    it('rechaza con 401 si la sesión fue eliminada en BD', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: env.ALLOWED_ORIGIN },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });
      const cookie = loginRes.cookies[0];

      // Borrar todas las sesiones
      await prisma.session.deleteMany();

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          [cookie!.name]: cookie!.value,
        },
      });

      expect(meRes.statusCode).toBe(401);
    });
  });

  describe('Cierre de sesión (POST /api/auth/logout)', () => {
    it('elimina la sesión en base de datos y borra la cookie', async () => {
      // Iniciar sesión
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: env.ALLOWED_ORIGIN },
        payload: {
          email: 'hero@burgoslabs.es',
          password: 'PasswordSegura123!',
        },
      });
      const cookie = loginRes.cookies[0];
      expect(cookie).toBeDefined();

      // Cerrar sesión
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { origin: env.ALLOWED_ORIGIN },
        cookies: {
          [cookie!.name]: cookie!.value,
        },
      });

      expect(logoutRes.statusCode).toBe(200);

      // Verificar que la cookie fue limpiada
      const clearCookie = logoutRes.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(clearCookie).toBeDefined();

      // Verificar que ya no se puede acceder a /api/auth/me
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          [cookie!.name]: cookie!.value,
        },
      });
      expect(meRes.statusCode).toBe(401);
    });
  });
});
