import { Hono } from 'hono';
import { z } from 'zod';
import { CreateCharacterInputSchema, UpdateCharacterInputSchema } from '@rol/shared';
import { prisma } from '../../lib/prisma.js';
import { authMiddleware, type AuthContextVariables } from '../../middleware/auth.js';
import { canReadCharacter, canEditCharacter, canAssignCharacterToCampaign } from '../../lib/authz.js';
import type { Prisma } from '@prisma/client';

export const charactersModule = new Hono<{ Variables: AuthContextVariables }>();

// Todas las rutas requieren sesión activa
charactersModule.use('*', authMiddleware);

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().optional(),
  system: z.string().optional(),
});

// GET /api/characters
charactersModule.get('/', async (c) => {
  const user = c.get('user');
  const queryResult = ListQuerySchema.safeParse(c.req.query());
  const query = queryResult.success ? queryResult.data : { page: 1, limit: 20 };

  const page = query.page;
  const limit = Math.min(50, query.limit);
  const skip = (page - 1) * limit;

  const where: Prisma.CharacterWhereInput = {
    ownerId: user.id,
  };

  if (query.search && query.search.trim()) {
    where.name = {
      contains: query.search.trim(),
      mode: 'insensitive',
    };
  }

  if (query.system && query.system.trim()) {
    where.system = query.system.trim();
  }

  const [total, items] = await Promise.all([
    prisma.character.count({ where }),
    prisma.character.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true, dmId: true } },
      },
    }),
  ]);

  return c.json({ items, total, page, limit }, 200);
});

// POST /api/characters
charactersModule.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parseResult = CreateCharacterInputSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      },
      400
    );
  }

  const input = parseResult.data;

  // Si se asigna a una campaña, validar membresía
  if (input.campaignId) {
    const membership = await prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId: input.campaignId,
          userId: user.id,
        },
      },
    });

    if (!canAssignCharacterToCampaign(user.id, user.id, !!membership)) {
      return c.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'No puedes asignar un personaje a una campaña de la que no eres miembro',
        },
        400
      );
    }
  }

  const character = await prisma.character.create({
    data: {
      name: input.name,
      system: input.system,
      campaignId: input.campaignId ?? null,
      ownerId: user.id,
      data: input.data as Prisma.InputJsonValue,
    },
    include: {
      campaign: { select: { id: true, name: true, dmId: true } },
    },
  });

  return c.json({ character }, 201);
});

// GET /api/characters/:id
charactersModule.get('/:id', async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      campaign: { select: { id: true, name: true, dmId: true } },
    },
  });

  if (!character || !canReadCharacter(user.id, character)) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      },
      404
    );
  }

  return c.json({ character }, 200);
});

// PUT /api/characters/:id
charactersModule.put('/:id', async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  // Filtro de pertenencia directo en BD
  const existing = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      campaign: { select: { id: true, name: true, dmId: true } },
    },
  });

  if (!existing || !canEditCharacter(user.id, existing)) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      },
      404
    );
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateCharacterInputSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
        issues: parseResult.error.issues,
      },
      400
    );
  }

  const input = parseResult.data;

  // Si se cambia la campaña
  if (input.campaignId !== undefined && input.campaignId !== null && input.campaignId !== existing.campaignId) {
    const membership = await prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId: input.campaignId,
          userId: user.id,
        },
      },
    });

    if (!canAssignCharacterToCampaign(user.id, existing.ownerId, !!membership)) {
      return c.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'No puedes asignar un personaje a una campaña de la que no eres miembro',
        },
        400
      );
    }
  }

  const dataToUpdate: Prisma.CharacterUpdateInput = {};
  if (input.name !== undefined) dataToUpdate.name = input.name;
  if (input.system !== undefined) dataToUpdate.system = input.system;
  if (input.campaignId !== undefined) {
    dataToUpdate.campaign = input.campaignId ? { connect: { id: input.campaignId } } : { disconnect: true };
  }
  if (input.data !== undefined) {
    dataToUpdate.data = input.data as Prisma.InputJsonValue;
  }

  const character = await prisma.character.update({
    where: { id: characterId },
    data: dataToUpdate,
    include: {
      campaign: { select: { id: true, name: true, dmId: true } },
    },
  });

  return c.json({ character }, 200);
});

// DELETE /api/characters/:id
charactersModule.delete('/:id', async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  const existing = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!existing || !canEditCharacter(user.id, existing)) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'Personaje no encontrado',
      },
      404
    );
  }

  await prisma.character.delete({
    where: { id: characterId },
  });

  return c.body(null, 204);
});
