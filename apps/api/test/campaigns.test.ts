import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import type { Hono } from 'hono';

describe('Módulo de Campañas (API Hono)', () => {
  let app: Hono;
  let dmCookie: string;
  let playerCookie: string;
  let otherCookie: string;

  const getCookieHeader = (res: Response) => {
    const raw = res.headers.get('set-cookie');
    return raw ? raw.split(';')[0] : '';
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
    await prisma.character.deleteMany();
    await prisma.campaignMember.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimit.deleteMany();

    // Crear DM
    const dmRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '30.0.0.1',
      },
      body: JSON.stringify({
        email: 'dm_camp@burgoslabs.es',
        displayName: 'Dungeon Master',
        password: 'PasswordSegura123!',
      }),
    });
    dmCookie = getCookieHeader(dmRes);

    // Crear Jugador
    const playerRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '30.0.0.2',
      },
      body: JSON.stringify({
        email: 'player_camp@burgoslabs.es',
        displayName: 'Jugador 1',
        password: 'PasswordSegura123!',
      }),
    });
    playerCookie = getCookieHeader(playerRes);

    // Crear Usuario ajeno
    const otherRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '30.0.0.3',
      },
      body: JSON.stringify({
        email: 'other_camp@burgoslabs.es',
        displayName: 'Otro Usuario',
        password: 'PasswordSegura123!',
      }),
    });
    otherCookie = getCookieHeader(otherRes);
  });

  afterAll(async () => {
    await prisma.character.deleteMany();
    await prisma.campaignMember.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rateLimit.deleteMany();
    await prisma.$disconnect();
  });

  let createdCampaignId: string;
  let inviteCode: string;

  it('permite al DM crear una campaña y genera inviteCode seguro', async () => {
    const res = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: dmCookie,
      },
      body: JSON.stringify({
        name: 'Las Minas Perdidas de Phandelver',
        system: 'dnd5e',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.campaign.name).toBe('Las Minas Perdidas de Phandelver');
    expect(body.campaign.inviteCode).toBeDefined();
    expect(body.campaign.inviteCode.length).toBeGreaterThanOrEqual(4);

    createdCampaignId = body.campaign.id;
    inviteCode = body.campaign.inviteCode;
  });

  it('lista las campañas del usuario', async () => {
    const res = await app.request('/api/campaigns', {
      method: 'GET',
      headers: { Cookie: dmCookie },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaigns.length).toBe(1);
    expect(body.campaigns[0].id).toBe(createdCampaignId);
  });

  it('permite a un jugador unirse mediante inviteCode', async () => {
    const res = await app.request('/api/campaigns/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: playerCookie,
      },
      body: JSON.stringify({
        inviteCode,
      }),
    });

    expect(res.status).toBe(200);

    // Verificar en BD que es miembro
    const member = await prisma.campaignMember.findFirst({
      where: {
        campaignId: createdCampaignId,
        user: { email: 'player_camp@burgoslabs.es' },
      },
    });
    expect(member).not.toBeNull();
    expect(member?.role).toBe('PLAYER');
  });

  it('permite a miembros y DM leer la campaña, pero rechaza a ajenos con 404', async () => {
    // 1. DM puede leer
    const dmRes = await app.request(`/api/campaigns/${createdCampaignId}`, {
      method: 'GET',
      headers: { Cookie: dmCookie },
    });
    expect(dmRes.status).toBe(200);

    // 2. Jugador miembro puede leer
    const playerRes = await app.request(`/api/campaigns/${createdCampaignId}`, {
      method: 'GET',
      headers: { Cookie: playerCookie },
    });
    expect(playerRes.status).toBe(200);

    // 3. Usuario ajeno recibe 404 (anti-enumeración)
    const otherRes = await app.request(`/api/campaigns/${createdCampaignId}`, {
      method: 'GET',
      headers: { Cookie: otherCookie },
    });
    expect(otherRes.status).toBe(404);
  });

  it('permite al DM inspeccionar las fichas de los jugadores en /api/campaigns/:id/characters', async () => {
    // Asignar una ficha del jugador a la campaña
    const char = await prisma.character.create({
      data: {
        name: 'Sora',
        system: 'dnd5e',
        owner: { connect: { email: 'player_camp@burgoslabs.es' } },
        campaign: { connect: { id: createdCampaignId } },
        data: { class: 'Paladín', level: 2 },
      },
    });

    const res = await app.request(`/api/campaigns/${createdCampaignId}/characters`, {
      method: 'GET',
      headers: { Cookie: dmCookie },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.characters.length).toBe(1);
    expect(body.characters[0].name).toBe('Sora');
    expect(body.characters[0].id).toBe(char.id);
  });

  it('deniega a un jugador no-DM inspeccionar las fichas con 403 Forbidden', async () => {
    const res = await app.request(`/api/campaigns/${createdCampaignId}/characters`, {
      method: 'GET',
      headers: { Cookie: playerCookie },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });
});
