import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { SESSION_COOKIE_NAME } from '../lib/tokens.js';
import { authService } from '../modules/auth/auth.service.js';
import type { UserPublic } from '@rol/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserPublic | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null);

  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'No autenticado o sesión expirada',
      });
    }

    const user = await authService.getSessionUser(token);
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'No autenticado o sesión expirada',
      });
    }

    request.user = user;
  };

  fastify.decorate('authenticate', authenticate);
};

export default fp(authPlugin, { name: 'auth' });
