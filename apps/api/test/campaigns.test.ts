import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { FastifyInstance } from 'fastify';

describe('Módulo de Campañas (API)', () => {
  let app: FastifyInstance;
  let dmCookie: string;
  let dmUserId: string;
  let playerCookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await prisma.$connect();

    // Crear DM
    const dmRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'dm_camp@burgoslabs.es',
        displayName: 'Dungeon Master',
        password: 'PasswordSegura123!',
      },
    });
    dmCookie = dmRes.cookies[0]!.value;
    dmUserId = JSON.parse(dmRes.body).user.id;

    // Crear Jugador
    const playerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'player_camp@burgoslabs.es',
        displayName: 'Jugador 1',
        password: 'PasswordSegura123!',
      },
    });
    playerCookie = playerRes.cookies[0]!.value;

    // Crear Usuario ajeno
    const otherRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'other_camp@burgoslabs.es',
        displayName: 'Otro Usuario',
        password: 'PasswordSegura123!',
      },
    });
    otherCookie = otherRes.cookies[0]!.value;
  });

  afterAll(async () => {
    await prisma.character.deleteMany();
    await prisma.campaignMember.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  let createdCampaignId: string;
  let createdInviteCode: string;

  it('permite al DM crear una campaña y genera inviteCode seguro', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
      payload: {
        name: 'La Tumba de los Horrores',
        system: 'dnd5e',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.campaign).toBeDefined();
    expect(data.campaign.name).toBe('La Tumba de los Horrores');
    expect(data.campaign.dmId).toBe(dmUserId);
    expect(data.campaign.inviteCode).toBeDefined();
    expect(data.campaign.inviteCode.length).toBeGreaterThanOrEqual(6);

    createdCampaignId = data.campaign.id;
    createdInviteCode = data.campaign.inviteCode;
  });

  it('permite a un jugador unirse a la campaña con el inviteCode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: playerCookie },
      payload: {
        inviteCode: createdInviteCode,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.campaign.id).toBe(createdCampaignId);
  });

  it('rechaza unirse con un inviteCode inexistente con 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: playerCookie },
      payload: {
        inviteCode: 'CODIGO_FALSO_123',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('el DM y los miembros pueden leer la campaña en /api/campaigns/:id', async () => {
    // DM lee
    const dmRes = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}`,
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
    });
    expect(dmRes.statusCode).toBe(200);

    // Jugador miembro lee
    const playerRes = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}`,
      cookies: { [SESSION_COOKIE_NAME]: playerCookie },
    });
    expect(playerRes.statusCode).toBe(200);
  });

  it('un usuario que no es miembro recibe 404 (evita enumeración) en /api/campaigns/:id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}`,
      cookies: { [SESSION_COOKIE_NAME]: otherCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('el DM puede ver los personajes de su campaña, pero un jugador o tercero recibe 404', async () => {
    // DM consulta
    const dmRes = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}/characters`,
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
    });
    expect(dmRes.statusCode).toBe(200);
    const data = JSON.parse(dmRes.body);
    expect(Array.isArray(data.characters)).toBe(true);

    // Jugador (no DM) consulta -> recibe 404
    const playerRes = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}/characters`,
      cookies: { [SESSION_COOKIE_NAME]: playerCookie },
    });
    expect(playerRes.statusCode).toBe(404);

    // Usuario ajeno -> recibe 404
    const otherRes = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}/characters`,
      cookies: { [SESSION_COOKIE_NAME]: otherCookie },
    });
    expect(otherRes.statusCode).toBe(404);
  });
});
