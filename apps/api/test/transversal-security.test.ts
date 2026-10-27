import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import type { Hono } from 'hono';

describe('Seguridad Transversal (Fase 5 - Hono)', () => {
  let app: Hono;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    await prisma.rateLimit.deleteMany();
  });

  afterAll(async () => {
    await prisma.rateLimit.deleteMany();
    await prisma.$disconnect();
  });

  describe('Cabeceras de seguridad (secureHeaders)', () => {
    it('incluye cabeceras de protección en las respuestas', async () => {
      const res = await app.request('/health', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('same-origin');
      expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    });
  });

  describe('CORS restringido', () => {
    it('permite preflight OPTIONS desde ALLOWED_ORIGIN', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'OPTIONS',
        headers: {
          Origin: env.ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('access-control-allow-origin')).toBe(env.ALLOWED_ORIGIN);
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('no autoriza orígenes no permitidos', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://atacante-externo.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('Límite de tamaño de cuerpo (bodyLimit 256 KB)', () => {
    it('rechaza con 413 peticiones que superen los 256 KB', async () => {
      // 300 KB de payload
      const hugeString = 'X'.repeat(300 * 1024);

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
        },
        body: JSON.stringify({
          email: 'huge@burgoslabs.es',
          displayName: 'Huge',
          password: 'Password123!',
          extra: hugeString,
        }),
      });

      expect(res.status).toBe(413);
    });
  });

  describe('Rate Limiting estricto en autenticación (5 req/min por IP -> 429)', () => {
    it('devuelve 429 tras superar el límite de 5 intentos por minuto (Test 7 del Plan)', async () => {
      const testIp = '198.51.100.42'; // IP única para este test
      await prisma.rateLimit.deleteMany({ where: { key: `login:${testIp}` } });

      // Ejecutar 5 intentos de login fallidos
      for (let i = 0; i < 5; i++) {
        const res = await app.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: env.ALLOWED_ORIGIN,
            'x-real-ip': testIp,
          },
          body: JSON.stringify({
            email: 'rate_test@burgoslabs.es',
            password: 'BadPassword!',
          }),
        });
        expect(res.status).toBe(401);
      }

      // El sexto intento debe ser bloqueado con 429 Too Many Requests
      const blockedRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': testIp,
        },
        body: JSON.stringify({
          email: 'rate_test@burgoslabs.es',
          password: 'BadPassword!',
        }),
      });

      expect(blockedRes.status).toBe(429);
      const data = await blockedRes.json();
      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Demasiadas solicitudes');
    });
  });
});
