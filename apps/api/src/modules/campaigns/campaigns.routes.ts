import { Hono } from 'hono';
import crypto from 'node:crypto';
import { CreateCampaignInputSchema, JoinCampaignInputSchema } from '@rol/shared';
import { prisma } from '../../lib/prisma.js';
import { authMiddleware, type AuthContextVariables } from '../../middleware/auth.js';
import { canReadCampaign, canManageCampaign } from '../../lib/authz.js';

export const campaignsModule = new Hono<{ Variables: AuthContextVariables }>();

campaignsModule.use('*', authMiddleware);

// GET /api/campaigns
campaignsModule.get('/', async (c) => {
  const user = c.get('user');

  const campaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        { dmId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      dm: { select: { id: true, displayName: true } },
      _count: {
        select: {
          members: true,
          characters: true,
        },
      },
    },
  });

  return c.json({ campaigns }, 200);
});

// POST /api/campaigns
campaignsModule.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parseResult = CreateCampaignInputSchema.safeParse(body);

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

  // Código criptográficamente seguro
  const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  const campaign = await prisma.campaign.create({
    data: {
      name: parseResult.data.name,
      system: parseResult.data.system || 'dnd5e',
      inviteCode,
      dmId: user.id,
      members: {
        create: {
          userId: user.id,
          role: 'DM',
        },
      },
    },
    include: {
      dm: { select: { id: true, displayName: true } },
      members: {
        include: {
          user: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  return c.json({ campaign }, 201);
});

// POST /api/campaigns/join
campaignsModule.post('/join', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parseResult = JoinCampaignInputSchema.safeParse(body);

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

  const campaign = await prisma.campaign.findUnique({
    where: { inviteCode: parseResult.data.inviteCode.trim().toUpperCase() },
  });

  if (!campaign) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'No existe ninguna campaña con el código de invitación proporcionado',
      },
      404
    );
  }

  // Verificar si ya es miembro
  const existingMember = await prisma.campaignMember.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: user.id,
      },
    },
  });

  if (!existingMember) {
    await prisma.campaignMember.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        role: 'PLAYER',
      },
    });
  }

  return c.json({ campaign }, 200);
});

// GET /api/campaigns/:id
campaignsModule.get('/:id', async (c) => {
  const user = c.get('user');
  const campaignId = c.req.param('id');

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      dm: { select: { id: true, displayName: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      characters: {
        include: {
          owner: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  if (!campaign || !canReadCampaign(user.id, campaign)) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'Campaña no encontrada',
      },
      404
    );
  }

  return c.json({ campaign }, 200);
});

// GET /api/campaigns/:id/characters (Exclusivo para el DM)
campaignsModule.get('/:id/characters', async (c) => {
  const user = c.get('user');
  const campaignId = c.req.param('id');

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      members: true,
    },
  });

  if (!campaign || !canReadCampaign(user.id, campaign)) {
    return c.json(
      {
        statusCode: 404,
        error: 'Not Found',
        message: 'Campaña no encontrada',
      },
      404
    );
  }

  if (!canManageCampaign(user.id, campaign)) {
    return c.json(
      {
        statusCode: 403,
        error: 'Forbidden',
        message: 'Solo el Director de Juego de la campaña puede acceder a las fichas completas',
      },
      403
    );
  }

  const characters = await prisma.character.findMany({
    where: { campaignId },
    include: {
      owner: { select: { id: true, displayName: true } },
    },
    orderBy: { name: 'asc' },
  });

  return c.json({ characters }, 200);
});
