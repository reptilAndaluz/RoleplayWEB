import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { Hono } from 'hono';

describe('Módulo de Autenticación (API Hono)', () => {
  let app: Hono;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimit.deleteMany();
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimit.deleteMany();
    await prisma.$disconnect();
  });

  describe('Protección CSRF en métodos mutantes', () => {
    it('rechaza peticiones mutantes sin cabecera Origin con 403', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test_csrf@burgoslabs.es',
          displayName: 'Test',
          password: 'Password123456!',
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain('Origin');
    });

    it('rechaza peticiones mutantes con cabecera Origin no permitida con 403', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://sitio-malicioso.com',
        },
        body: JSON.stringify({
          email: 'test_csrf2@burgoslabs.es',
          displayName: 'Test',
          password: 'Password123456!',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/register', () => {
    it('registra un usuario correctamente y devuelve cookie de sesión HttpOnly', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.1',
        },
        body: JSON.stringify({
          email: 'aventurero@burgoslabs.es',
          displayName: 'Drizzt DoUrden',
          password: 'SuperPassword123!',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('aventurero@burgoslabs.es');
      expect(data.user.displayName).toBe('Drizzt DoUrden');
      expect(data.user.passwordHash).toBeUndefined();

      // Cabecera Set-Cookie
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('rechaza contraseñas menores a 10 caracteres', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.2',
        },
        body: JSON.stringify({
          email: 'corto@burgoslabs.es',
          displayName: 'Corto',
          password: 'corta',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('10 caracteres');
    });

    it('rechaza registros con emails duplicados con 409 Conflict', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.3',
        },
        body: JSON.stringify({
          email: 'aventurero@burgoslabs.es',
          displayName: 'Clon',
          password: 'OtraPassword123!',
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('inicia sesión con credenciales correctas y rota la sesión', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.4',
        },
        body: JSON.stringify({
          email: 'aventurero@burgoslabs.es',
          password: 'SuperPassword123!',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.email).toBe('aventurero@burgoslabs.es');
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
    });

    it('devuelve mensaje genérico 401 si la contraseña es incorrecta', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.5',
        },
        body: JSON.stringify({
          email: 'aventurero@burgoslabs.es',
          password: 'PasswordErronea123!',
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe('Credenciales inválidas');
    });

    it('devuelve mensaje genérico 401 si el usuario no existe', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.6',
        },
        body: JSON.stringify({
          email: 'noexiste@burgoslabs.es',
          password: 'Password123456!',
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe('Credenciales inválidas');
    });
  });

  describe('GET /api/auth/me y POST /api/auth/logout', () => {
    it('devuelve el perfil del usuario autenticado y rechaza sin sesión', async () => {
      // 1. Login para obtener cookie
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': '10.0.0.7',
        },
        body: JSON.stringify({
          email: 'aventurero@burgoslabs.es',
          password: 'SuperPassword123!',
        }),
      });

      const setCookie = loginRes.headers.get('set-cookie')!;
      const cookieValue = setCookie.split(';')[0];

      // 2. GET /me con cookie
      const meRes = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          Cookie: cookieValue,
        },
      });

      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.user.email).toBe('aventurero@burgoslabs.es');

      // 3. GET /me sin cookie -> 401
      const unauthRes = await app.request('/api/auth/me', {
        method: 'GET',
      });
      expect(unauthRes.status).toBe(401);

      // 4. Logout
      const logoutRes = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: {
          Origin: env.ALLOWED_ORIGIN,
          Cookie: cookieValue,
        },
      });

      expect(logoutRes.status).toBe(200);

      // 5. GET /me tras logout -> 401
      const meAfterLogout = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          Cookie: cookieValue,
        },
      });
      expect(meAfterLogout.status).toBe(401);
    });
  });
});
