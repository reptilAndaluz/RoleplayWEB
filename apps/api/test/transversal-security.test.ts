import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { env } from '../src/config/env.js';
import type { FastifyInstance } from 'fastify';

describe('Seguridad Transversal (Fase 5)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cabeceras de seguridad (Helmet)', () => {
    it('incluye cabeceras de protección en las respuestas', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });

  describe('CORS restringido', () => {
    it('permite preflight OPTIONS desde ALLOWED_ORIGIN', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
          'access-control-request-method': 'POST',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBe(env.ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('no autoriza orígenes no permitidos', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/auth/login',
        headers: {
          origin: 'https://atacante-externo.com',
          'access-control-request-method': 'POST',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Límite de tamaño de cuerpo (bodyLimit 256 KB)', () => {
    it('rechaza con 413 peticiones que superen los 256 KB', async () => {
      // 300 KB de payload
      const hugeString = 'X'.repeat(300 * 1024);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin: env.ALLOWED_ORIGIN },
        payload: {
          email: 'huge@burgoslabs.es',
          displayName: 'Huge',
          password: 'Password123!',
          extra: hugeString,
        },
      });

      expect(res.statusCode).toBe(413);
    });
  });

  describe('Rate Limiting estricto en autenticación (5 req/min por IP -> 429)', () => {
    it('devuelve 429 tras superar el límite de 5 intentos por minuto (Test 7 del Plan)', async () => {
      const testIp = '198.51.100.42'; // IP única para este test

      // Ejecutar 5 intentos de login
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: {
            origin: env.ALLOWED_ORIGIN,
            'cf-connecting-ip': testIp,
          },
          payload: {
            email: 'rate_test@burgoslabs.es',
            password: 'BadPassword!',
          },
        });
        expect(res.statusCode).toBe(401); // Credenciales inválidas
      }

      // El sexto intento debe ser bloqueado con 429 Too Many Requests
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
          'cf-connecting-ip': testIp,
        },
        payload: {
          email: 'rate_test@burgoslabs.es',
          password: 'BadPassword!',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      const data = JSON.parse(blockedRes.body);
      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Demasiados intentos');
    });
  });
});
