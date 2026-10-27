import Fastify from 'fastify';
import http from 'node:http';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { HealthSchema, type Health } from '@rol/shared';
import csrfPlugin from './plugins/csrf.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { campaignsRoutes } from './modules/campaigns/campaigns.routes.js';
import { charactersRoutes } from './modules/characters/characters.routes.js';

export function buildServer() {
  const app = Fastify({
    bodyLimit: 256 * 1024, // Límite global estricto de 256 KB
    trustProxy: true, // Leer IP real detrás de Caddy / Cloudflare Tunnel
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                'req.body.password',
                'body.password',
                'token',
                'tokenHash',
                'password',
                'passwordHash',
                'SESSION_SECRET',
              ],
              censor: '[REDACTED]',
            },
            transport:
              env.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                      translateTime: 'HH:MM:ss Z',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
          },
  });

  // Cabeceras de seguridad con Helmet
  app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  // CORS restringido a ALLOWED_ORIGIN
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin === env.ALLOWED_ORIGIN) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Rate Limiting transversal con soporte para CF-Connecting-IP
  app.register(rateLimit, {
    global: true,
    max: 100, // Límite general por defecto (100 req/min)
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const cfIp = request.headers['cf-connecting-ip'];
      if (typeof cfIp === 'string' && cfIp.trim()) {
        return cfIp.trim();
      }
      return request.ip;
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Demasiadas solicitudes. Por favor, inténtelo de nuevo más tarde.',
    }),
  });

  // Cookies y sesión
  app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  // Plugins de seguridad de la app
  app.register(csrfPlugin);
  app.register(authPlugin);

  // Módulos
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(campaignsRoutes, { prefix: '/api/campaigns' });
  app.register(charactersRoutes, { prefix: '/api/characters' });

  // Manejador de errores global seguro (sin stack traces en producción)
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    request.log.error(error);

    // En producción, los errores 500 nunca devuelven detalles internos ni stack traces
    if (statusCode >= 500 && env.NODE_ENV === 'production') {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Ha ocurrido un error interno en el servidor',
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: http.STATUS_CODES[statusCode] || error.name || 'Error',
      message: error.message,
    });
  });

  // Health check
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
