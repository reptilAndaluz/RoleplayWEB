import { Hono } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

export const cronModule = new Hono();

// GET /api/cron/cleanup
cronModule.get('/cleanup', async (c) => {
  const authHeader = c.req.header('authorization');

  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
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
