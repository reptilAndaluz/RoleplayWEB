import type { MiddlewareHandler } from 'hono';
import { prisma } from '../lib/prisma.js';

interface RateLimitOptions {
  prefix: string;
  max: number;
  windowMs?: number; // Por defecto 60.000 ms (1 minuto)
}

/**
 * Obtiene la IP confiable inyectada por Vercel / Cloudflare
 */
export function getClientIp(headerFinder: (headerName: string) => string | undefined): string {
  const realIp = headerFinder('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = headerFinder('x-forwarded-for');
  if (forwardedFor && forwardedFor.trim()) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const cfIp = headerFinder('cf-connecting-ip');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  return '127.0.0.1';
}

/**
 * Middleware de Rate Limiting persistente en PostgreSQL (modelo RateLimit)
 * Válido para instancias serverless concurrentes
 */
export function createDbRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60 * 1000;

  return async (c, next) => {
    const ip = getClientIp((name) => c.req.header(name));
    const key = `${options.prefix}:${ip}`;
    const now = new Date();

    const existing = await prisma.rateLimit.findUnique({
      where: { key },
    });

    if (existing) {
      const elapsed = now.getTime() - existing.windowStart.getTime();

      if (elapsed < windowMs) {
        if (existing.count >= options.max) {
          return c.json(
            {
              statusCode: 429,
              error: 'Too Many Requests',
              message: 'Demasiadas solicitudes. Por favor, espere un minuto.',
            },
            429
          );
        }

        // Incrementar contador
        await prisma.rateLimit.update({
          where: { key },
          data: { count: { increment: 1 } },
        });
      } else {
        // La ventana expiró: reiniciar contador
        await prisma.rateLimit.update({
          where: { key },
          data: { count: 1, windowStart: now },
        });
      }
    } else {
      // Registro inicial
      await prisma.rateLimit.create({
        data: {
          key,
          count: 1,
          windowStart: now,
        },
      });
    }

    return await next();
  };
}
