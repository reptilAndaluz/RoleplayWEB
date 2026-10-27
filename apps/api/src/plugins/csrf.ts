import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

const csrfPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const mutantMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (mutantMethods.includes(request.method)) {
      const origin = request.headers['origin'];
      if (!origin || origin !== env.ALLOWED_ORIGIN) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message:
            'Petición mutante rechazada: cabecera Origin no coincide con ALLOWED_ORIGIN (CSRF)',
        });
      }
    }
  });
};

export default fp(csrfPlugin, { name: 'csrf' });
