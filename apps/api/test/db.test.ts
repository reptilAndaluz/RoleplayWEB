import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

describe('Base de datos: Verificación de Esquema e Integridad Relacional', () => {
  beforeAll(async () => {
    // Conectar a la base de datos
    await prisma.$connect();
  });

  afterAll(async () => {
    // Limpieza tras pruebas
    await prisma.character.deleteMany();
    await prisma.campaignMember.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('permite crear un usuario y una sesión asociada con tokenHash único', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: 'dummyhash1234567890',
      },
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'abc123sha256hashdummy',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user.id);
  });

  it('elimina en cascada las sesiones al borrar el usuario', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    });
    expect(user).not.toBeNull();

    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions.length).toBe(0);
    }
  });

  it('permite crear una campaña con su DM y miembros asociados', async () => {
    const dm = await prisma.user.create({
      data: {
        email: 'dm@example.com',
        displayName: 'Master DM',
        passwordHash: 'hashdm1234567890',
      },
    });

    const player = await prisma.user.create({
      data: {
        email: 'player@example.com',
        displayName: 'Player One',
        passwordHash: 'hashplayer1234567890',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        name: 'La Maldición de Strahd',
        system: 'dnd5e',
        inviteCode: 'INVITE1234',
        dmId: dm.id,
        members: {
          create: [
            { userId: dm.id, role: 'DM' },
            { userId: player.id, role: 'PLAYER' },
          ],
        },
      },
      include: {
        members: true,
      },
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.members.length).toBe(2);

    // Crear un personaje asignado a la campaña
    const character = await prisma.character.create({
      data: {
        name: 'Thorin Escudo de Roble',
        system: 'dnd5e',
        ownerId: player.id,
        campaignId: campaign.id,
        data: {
          class: 'Guerrero',
          level: 3,
        },
      },
    });

    expect(character.id).toBeDefined();
    expect(character.campaignId).toBe(campaign.id);

    // Al desasociar o eliminar campaña, el campaignId del personaje pasa a ser null (onDelete: SetNull)
    await prisma.campaign.delete({ where: { id: campaign.id } });

    const updatedChar = await prisma.character.findUnique({
      where: { id: character.id },
    });
    expect(updatedChar).not.toBeNull();
    expect(updatedChar?.campaignId).toBeNull();
  });
});
