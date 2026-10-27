import type { FastifyPluginAsync } from 'fastify';
import { RegisterInputSchema, LoginInputSchema } from '@rol/shared';
import { authService } from './auth.service.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../lib/tokens.js';
import { env } from '../../config/env.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      });
    }

    try {
      const { user, token, expiresAt } = await authService.register(parseResult.data);

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_SECONDS,
        expires: expiresAt,
      });

      return reply.status(201).send({ user });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      });
    }

    try {
      const previousToken = request.cookies[SESSION_COOKIE_NAME];
      const { user, token, expiresAt } = await authService.login(parseResult.data, previousToken);

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_SECONDS,
        expires: expiresAt,
      });

      return reply.status(200).send({ user });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 401;
      return reply.status(statusCode).send({
        statusCode,
        error: 'Unauthorized',
        message: error.message || 'Credenciales inválidas',
      });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await authService.logout(token);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return reply.status(200).send({ message: 'Sesión cerrada correctamente' });
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    return reply.status(200).send({ user: request.user });
  });
};
