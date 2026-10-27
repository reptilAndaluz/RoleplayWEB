import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CreateCampaignInputSchema, JoinCampaignInputSchema } from '@rol/shared';
import { campaignsService } from './campaigns.service.js';

const CampaignParamsSchema = z.object({
  id: z.string().uuid({ message: 'El id de campaña debe ser un UUID válido' }),
});

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const campaignsRoutes: FastifyPluginAsync = async (fastify) => {
  // Todas las rutas de campañas requieren autenticación
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /api/campaigns
  fastify.post('/', async (request, reply) => {
    const parseResult = CreateCampaignInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      });
    }

    const campaign = await campaignsService.createCampaign(request.user!.id, parseResult.data);
    return reply.status(201).send({ campaign });
  });

  // GET /api/campaigns
  fastify.get('/', async (request, reply) => {
    const parseQuery = PaginationQuerySchema.safeParse(request.query);
    const query = parseQuery.success ? parseQuery.data : {};

    const result = await campaignsService.listUserCampaigns(request.user!.id, query);
    return reply.status(200).send(result);
  });

  // POST /api/campaigns/join
  fastify.post('/join', async (request, reply) => {
    const parseResult = JoinCampaignInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      });
    }

    try {
      const campaign = await campaignsService.joinCampaign(request.user!.id, parseResult.data);
      return reply.status(200).send({ campaign });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // GET /api/campaigns/:id
  fastify.get('/:id', async (request, reply) => {
    const parseParams = CampaignParamsSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Campaña no encontrada',
      });
    }

    try {
      const campaign = await campaignsService.getCampaignById(
        request.user!.id,
        parseParams.data.id,
      );
      return reply.status(200).send({ campaign });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 404;
      return reply.status(statusCode).send({
        statusCode,
        error: 'Not Found',
        message: error.message || 'Campaña no encontrada',
      });
    }
  });

  // GET /api/campaigns/:id/characters (solo para el DM)
  fastify.get('/:id/characters', async (request, reply) => {
    const parseParams = CampaignParamsSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Campaña no encontrada',
      });
    }

    try {
      const characters = await campaignsService.getCampaignCharacters(
        request.user!.id,
        parseParams.data.id,
      );
      return reply.status(200).send({ characters });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode || 404;
      return reply.status(statusCode).send({
        statusCode,
        error: 'Not Found',
        message: error.message || 'Campaña no encontrada',
      });
    }
  });
};
