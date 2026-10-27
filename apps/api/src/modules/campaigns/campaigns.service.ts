import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { canReadCampaign, canManageCampaign } from '../../lib/authz.js';
import type { CreateCampaignInput, JoinCampaignInput, CampaignPublic } from '@rol/shared';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export function generateInviteCode(): string {
  // Genera un código de 8 caracteres alfanuméricos en mayúsculas (4 bytes)
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export class CampaignsService {
  async createCampaign(userId: string, input: CreateCampaignInput): Promise<CampaignPublic> {
    const inviteCode = generateInviteCode();

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: input.name,
          system: input.system,
          inviteCode,
          dmId: userId,
          members: {
            create: [
              {
                userId,
                role: 'DM',
              },
            ],
          },
        },
        include: {
          dm: { select: { id: true, email: true, displayName: true, createdAt: true } },
          members: {
            include: {
              user: { select: { id: true, email: true, displayName: true, createdAt: true } },
            },
          },
        },
      });
      return created;
    });

    return campaign as unknown as CampaignPublic;
  }

  async listUserCampaigns(userId: string, pagination: PaginationParams) {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(50, Math.max(1, pagination.limit || 20));
    const skip = (page - 1) * limit;

    const where = {
      OR: [{ dmId: userId }, { members: { some: { userId } } }],
    };

    const [total, items] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          dm: { select: { id: true, email: true, displayName: true, createdAt: true } },
          members: {
            include: {
              user: { select: { id: true, email: true, displayName: true, createdAt: true } },
            },
          },
        },
      }),
    ]);

    return {
      items: items as unknown as CampaignPublic[],
      total,
      page,
      limit,
    };
  }

  async getCampaignById(userId: string, campaignId: string): Promise<CampaignPublic> {
    const notFoundError = new Error('Campaña no encontrada');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        dm: { select: { id: true, email: true, displayName: true, createdAt: true } },
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true, createdAt: true } },
          },
        },
      },
    });

    if (!campaign) {
      throw notFoundError;
    }

    if (!canReadCampaign(userId, campaign)) {
      // Retornar 404 idéntico para evitar enumeración
      throw notFoundError;
    }

    return campaign as unknown as CampaignPublic;
  }

  async joinCampaign(userId: string, input: JoinCampaignInput): Promise<CampaignPublic> {
    const notFoundError = new Error('Campaña no encontrada');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    const campaign = await prisma.campaign.findUnique({
      where: { inviteCode: input.inviteCode.trim().toUpperCase() },
      include: {
        dm: { select: { id: true, email: true, displayName: true, createdAt: true } },
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true, createdAt: true } },
          },
        },
      },
    });

    if (!campaign) {
      throw notFoundError;
    }

    const alreadyMember = campaign.members.some((m) => m.userId === userId);
    if (!alreadyMember) {
      await prisma.campaignMember.create({
        data: {
          campaignId: campaign.id,
          userId,
          role: 'PLAYER',
        },
      });

      // Refrescar campaña
      return this.getCampaignById(userId, campaign.id);
    }

    return campaign as unknown as CampaignPublic;
  }

  async getCampaignCharacters(userId: string, campaignId: string) {
    const notFoundError = new Error('Campaña no encontrada');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || !canManageCampaign(userId, campaign)) {
      // Si no existe o el usuario no es el DM, retornar 404 idéntico
      throw notFoundError;
    }

    const characters = await prisma.character.findMany({
      where: { campaignId },
      include: {
        owner: { select: { id: true, email: true, displayName: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return characters;
  }
}

export const campaignsService = new CampaignsService();
