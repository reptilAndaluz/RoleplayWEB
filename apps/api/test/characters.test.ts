import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import type { Hono } from 'hono';

describe('Módulo de Personajes (API Hono)', () => {
  let app: Hono;
  let userACookie: string;
  let userBCookie: string;
  let dmCookie: string;
  let campaignId: string;

  const validDndData = {
    class: 'Mago',
    level: 3,
    race: 'Elfo',
    background: 'Erudito',
    alignment: 'Neutral',
    experiencePoints: 900,
    attributes: {
      strength: 8,
      dexterity: 14,
      constitution: 13,
      intelligence: 16,
      wisdom: 12,
      charisma: 10,
    },
    armorClass: 12,
    speed: 30,
    initiative: 2,
    hitPoints: {
      current: 18,
      max: 18,
      temp: 0,
    },
    hitDice: '3d6',
  };

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

    // Crear Usuario A
    const resA = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '20.0.0.1',
      },
      body: JSON.stringify({
        email: 'usera_chars@burgoslabs.es',
        displayName: 'Usuario A',
        password: 'PasswordSegura123!',
      }),
    });
    userACookie = getCookieHeader(resA);

    // Crear Usuario B
    const resB = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '20.0.0.2',
      },
      body: JSON.stringify({
        email: 'userb_chars@burgoslabs.es',
        displayName: 'Usuario B',
        password: 'PasswordSegura123!',
      }),
    });
    userBCookie = getCookieHeader(resB);

    // Crear DM y campaña
    const resDM = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '20.0.0.3',
      },
      body: JSON.stringify({
        email: 'dm_chars@burgoslabs.es',
        displayName: 'Dungeon Master',
        password: 'PasswordSegura123!',
      }),
    });
    dmCookie = getCookieHeader(resDM);

    const resCamp = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: dmCookie,
      },
      body: JSON.stringify({
        name: 'Campaña de Prueba',
        system: 'dnd5e',
      }),
    });
    const campData = await resCamp.json();
    campaignId = campData.campaign.id;
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

  it('permite crear una ficha D&D 5e válida a Usuario A', async () => {
    const res = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Raistlin Majere',
        system: 'dnd5e',
        data: validDndData,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.character.name).toBe('Raistlin Majere');
    expect(body.character.system).toBe('dnd5e');
  });

  it('rechaza la creación de ficha si los datos violan el esquema (ej. atributos mayores a 30)', async () => {
    const invalidData = {
      ...validDndData,
      attributes: {
        ...validDndData.attributes,
        strength: 55, // Máximo permitido: 30
      },
    };

    const res = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Hulk',
        system: 'dnd5e',
        data: invalidData,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('30');
  });

  it('rechaza asignar una ficha a una campaña si el usuario no es miembro', async () => {
    const res = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userBCookie,
      },
      body: JSON.stringify({
        name: 'Intruso',
        system: 'dnd5e',
        campaignId,
        data: validDndData,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('no eres miembro');
  });

  it('lista las fichas del usuario con paginación y búsqueda', async () => {
    const res = await app.request('/api/characters?page=1&limit=10&search=Raistlin', {
      method: 'GET',
      headers: {
        Cookie: userACookie,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].name).toBe('Raistlin Majere');
    expect(body.total).toBe(1);
  });

  it('permite al propietario editar su propia ficha', async () => {
    const listRes = await app.request('/api/characters', {
      method: 'GET',
      headers: { Cookie: userACookie },
    });
    const list = await listRes.json();
    const charId = list.items[0].id;

    const res = await app.request(`/api/characters/${charId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Raistlin el Túnica Negra',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.character.name).toBe('Raistlin el Túnica Negra');
  });

  it('permite al propietario borrar su ficha con código 204 No Content', async () => {
    const listRes = await app.request('/api/characters', {
      method: 'GET',
      headers: { Cookie: userACookie },
    });
    const list = await listRes.json();
    const charId = list.items[0].id;

    const res = await app.request(`/api/characters/${charId}`, {
      method: 'DELETE',
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
    });

    expect(res.status).toBe(204);

    const checkRes = await app.request(`/api/characters/${charId}`, {
      method: 'GET',
      headers: { Cookie: userACookie },
    });
    expect(checkRes.status).toBe(404);
  });
});
