import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CreateCharacterInputSchema, UpdateCharacterInputSchema } from '@rol/shared';
import { charactersService } from './characters.service.js';

const CharacterParamsSchema = z.object({
  id: z.string().uuid({ message: 'El id de personaje debe ser un UUID válido' }),
});

const CharacterListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  search: z.string().optional(),
  system: z.string().optional(),
});

export const charactersRoutes: FastifyPluginAsync = async (fastify) => {
  // Todas las rutas de personajes requieren autenticación
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /api/characters
  fastify.get('/', async (request, reply) => {
    const parseQuery = CharacterListQuerySchema.safeParse(request.query);
    const query = parseQuery.success ? parseQuery.data : {};

    const result = await charactersService.listUserCharacters(request.user!.id, query);
    return reply.status(200).send(result);
  });

  // POST /api/characters
  fastify.post('/', async (request, reply) => {
    const parseResult = CreateCharacterInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      });
    }

    try {
      const character = await charactersService.createCharacter(request.user!.id, parseResult.data);
      return reply.status(201).send({ character });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // GET /api/characters/:id
  fastify.get('/:id', async (request, reply) => {
    const parseParams = CharacterParamsSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      });
    }

    try {
      const character = await charactersService.getCharacterById(
        request.user!.id,
        parseParams.data.id,
      );
      return reply.status(200).send({ character });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 404;
      return reply.status(statusCode).send({
        statusCode,
        error: 'Not Found',
        message: error.message || 'Personaje no encontrado',
      });
    }
  });

  // PUT /api/characters/:id
  fastify.put('/:id', async (request, reply) => {
    const parseParams = CharacterParamsSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      });
    }

    const parseBody = UpdateCharacterInputSchema.safeParse(request.body);
    if (!parseBody.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseBody.error.issues.map((i) => i.message).join(', '),
        issues: parseBody.error.issues,
      });
    }

    try {
      const character = await charactersService.updateCharacter(
        request.user!.id,
        parseParams.data.id,
        parseBody.data,
      );
      return reply.status(200).send({ character });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 404;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 400 ? 'Bad Request' : 'Not Found',
        message: error.message || 'Personaje no encontrado',
      });
    }
  });

  // DELETE /api/characters/:id
  fastify.delete('/:id', async (request, reply) => {
    const parseParams = CharacterParamsSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      });
    }

    try {
      const result = await charactersService.deleteCharacter(request.user!.id, parseParams.data.id);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 404;
      return reply.status(statusCode).send({
        statusCode,
        error: 'Not Found',
        message: error.message || 'Personaje no encontrado',
      });
    }
  });
};
