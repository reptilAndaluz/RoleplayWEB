import { prisma } from '../../lib/prisma.js';
import { canAssignCharacterToCampaign } from '../../lib/authz.js';
import type { CreateCharacterInput, UpdateCharacterInput } from '@rol/shared';
import type { Prisma } from '@prisma/client';

export interface CharacterListQuery {
  page?: number;
  limit?: number;
  search?: string;
  system?: string;
}

export class CharactersService {
  async createCharacter(userId: string, input: CreateCharacterInput) {
    // Si se asigna a una campaña, validar que el usuario sea miembro de esa campaña
    if (input.campaignId) {
      const membership = await prisma.campaignMember.findUnique({
        where: {
          campaignId_userId: {
            campaignId: input.campaignId,
            userId,
          },
        },
      });

      if (!canAssignCharacterToCampaign(userId, userId, !!membership)) {
        const error = new Error(
          'No puedes asignar un personaje a una campaña de la que no eres miembro',
        );
        (error as Error & { statusCode: number }).statusCode = 400;
        throw error;
      }
    }

    const character = await prisma.character.create({
      data: {
        name: input.name,
        system: input.system,
        campaignId: input.campaignId || null,
        ownerId: userId,
        data: input.data as Prisma.InputJsonValue,
      },
      include: {
        campaign: { select: { id: true, name: true, dmId: true } },
      },
    });

    return character;
  }

  async listUserCharacters(userId: string, query: CharacterListQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CharacterWhereInput = {
      ownerId: userId,
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

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getCharacterById(userId: string, characterId: string) {
    const notFoundError = new Error('Personaje no encontrado');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    // Regla obligatoria: Toda consulta incluye el filtro de pertenencia en la propia query Prisma
    // Permitido para: Propietario O DM de la campaña asignada
    const character = await prisma.character.findFirst({
      where: {
        id: characterId,
        OR: [{ ownerId: userId }, { campaign: { dmId: userId } }],
      },
      include: {
        campaign: { select: { id: true, name: true, dmId: true } },
        owner: { select: { id: true, email: true, displayName: true } },
      },
    });

    if (!character) {
      throw notFoundError;
    }

    return character;
  }

  async updateCharacter(userId: string, characterId: string, input: UpdateCharacterInput) {
    const notFoundError = new Error('Personaje no encontrado');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    // Solo el propietario puede editar
    const existing = await prisma.character.findFirst({
      where: {
        id: characterId,
        ownerId: userId,
      },
    });

    if (!existing) {
      throw notFoundError;
    }

    // Si se modifica la campaña, validar que sea miembro
    if (
      input.campaignId !== undefined &&
      input.campaignId !== null &&
      input.campaignId !== existing.campaignId
    ) {
      const membership = await prisma.campaignMember.findUnique({
        where: {
          campaignId_userId: {
            campaignId: input.campaignId,
            userId,
          },
        },
      });

      if (!canAssignCharacterToCampaign(userId, userId, !!membership)) {
        const error = new Error(
          'No puedes asignar un personaje a una campaña de la que no eres miembro',
        );
        (error as Error & { statusCode: number }).statusCode = 400;
        throw error;
      }
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        name: input.name ?? existing.name,
        system: input.system ?? existing.system,
        campaignId: input.campaignId !== undefined ? input.campaignId : existing.campaignId,
        data: input.data !== undefined ? (input.data as Prisma.InputJsonValue) : existing.data,
      },
      include: {
        campaign: { select: { id: true, name: true, dmId: true } },
      },
    });

    return updated;
  }

  async deleteCharacter(userId: string, characterId: string) {
    const notFoundError = new Error('Personaje no encontrado');
    (notFoundError as Error & { statusCode: number }).statusCode = 404;

    // Solo el propietario puede borrar
    const existing = await prisma.character.findFirst({
      where: {
        id: characterId,
        ownerId: userId,
      },
    });

    if (!existing) {
      throw notFoundError;
    }

    await prisma.character.delete({
      where: { id: characterId },
    });

    return { message: 'Personaje eliminado correctamente' };
  }
}

export const charactersService = new CharactersService();
