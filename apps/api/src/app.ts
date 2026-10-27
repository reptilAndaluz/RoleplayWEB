import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { env } from './config/env.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { authModule } from './modules/auth/auth.routes.js';
import { charactersModule } from './modules/characters/characters.routes.js';
import { campaignsModule } from './modules/campaigns/campaigns.routes.js';
import { cronModule } from './modules/cron/cron.routes.js';
import { HealthSchema, type Health } from '@rol/shared';

export function createApp() {
  const app = new Hono();

  // 1. Cabeceras de seguridad
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", env.ALLOWED_ORIGIN],
      },
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'same-origin',
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    })
  );

  // 2. CORS restringido a ALLOWED_ORIGIN
  app.use(
    '*',
    cors({
      origin: env.ALLOWED_ORIGIN,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    })
  );

  // 3. Límite de tamaño del cuerpo de petición (256 KB)
  app.use(
    '*',
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) =>
        c.json(
          {
            statusCode: 413,
            error: 'Payload Too Large',
            message: 'El tamaño de la petición excede el límite permitido de 256 KB',
          },
          413
        ),
    })
  );

  // 4. Protección CSRF en métodos mutantes
  app.use('*', csrfMiddleware);

  // 5. Manejador global de errores seguro (sin stack traces en producción)
  app.onError((err, c) => {
    console.error('[API Error]:', err);

    const isProd = env.NODE_ENV === 'production';
    const message = isProd ? 'Ha ocurrido un error interno en el servidor' : err.message;

    return c.json(
      {
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      },
      500
    );
  });

  // Health check
  app.get('/health', (c) => {
    const healthData: Health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    const valid = HealthSchema.safeParse(healthData);
    if (!valid.success) {
      return c.json(healthData, 500);
    }
    return c.json(healthData, 200);
  });

  // Módulos de la API
  app.route('/api/auth', authModule);
  app.route('/api/characters', charactersModule);
  app.route('/api/campaigns', campaignsModule);
  app.route('/api/cron', cronModule);

  return app;
}

export const app = createApp();
