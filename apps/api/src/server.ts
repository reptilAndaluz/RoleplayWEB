import Fastify from 'fastify';
import { env } from './config/env.js';
import { HealthSchema, type Health } from '@rol/shared';

export function buildServer() {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            },
          }
        : true,
  });

  app.get('/health', async (_request, reply): Promise<Health> => {
    const healthData: Health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    const valid = HealthSchema.safeParse(healthData);
    if (!valid.success) {
      return reply.status(500).send(healthData);
    }
    return healthData;
  });

  return app;
}

async function start() {
  const server = buildServer();
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`API escuchando en http://${env.HOST}:${env.PORT} [${env.NODE_ENV}]`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Ejecutar servidor si este archivo se ejecuta directamente
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  start();
}
