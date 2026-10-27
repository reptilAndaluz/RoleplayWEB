import { Hono } from 'hono';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

export const cronModule = new Hono();

function safeCompareBearer(headerVal: string | undefined, secret: string | undefined): boolean {
  if (!headerVal || !secret || secret.trim() === '') return false;
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(headerVal);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

// GET /api/cron/cleanup
cronModule.get('/cleanup', async (c) => {
  const authHeader = c.req.header('authorization');

  if (!safeCompareBearer(authHeader, env.CRON_SECRET)) {
    return c.json(
      {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'CRON_SECRET inválido o ausente',
      },
      401
    );
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [sessionsResult, rateLimitsResult] = await Promise.all([
    // Borrar sesiones caducadas
    prisma.session.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    }),
    // Borrar registros de RateLimit antiguos (> 1 hora)
    prisma.rateLimit.deleteMany({
      where: {
        windowStart: { lte: oneHourAgo },
      },
    }),
  ]);

  return c.json(
    {
      ok: true,
      timestamp: now.toISOString(),
      deletedSessions: sessionsResult.count,
      deletedRateLimits: rateLimitsResult.count,
    },
    200
  );
});
