import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE_NAME } from '../lib/tokens.js';
import { hashToken } from '../lib/hash.js';
import { prisma } from '../lib/prisma.js';
import type { User, Session } from '@prisma/client';

export interface AuthContextVariables {
  user: User;
  session: Session;
}

export const authMiddleware: MiddlewareHandler<{ Variables: AuthContextVariables }> = async (
  c,
  next
) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);

  if (!token) {
    return c.json(
      {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'No autenticado: falta la sesión',
      },
      401
    );
  }

  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return c.json(
      {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Sesión inválida o expirada',
      },
      401
    );
  }

  c.set('user', session.user);
  c.set('session', session);

  return await next();
};
