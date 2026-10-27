import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';

/**
 * Middleware CSRF estricto: valida la cabecera Origin en peticiones mutantes
 */
export const csrfMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;

  // Permitir endpoints de cron de mantenimiento autenticados por token Bearer
  if (path.startsWith('/api/cron/')) {
    return next();
  }

  // Métodos mutantes requieren validación de Origin
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = c.req.header('origin');

    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return c.json(
        {
          statusCode: 403,
          error: 'Forbidden',
          message: 'Cabecera Origin no permitida o ausente',
        },
        403
      );
    }
  }

  await next();
};
