import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { FastifyInstance } from 'fastify';

describe('Módulo de Personajes (API)', () => {
  let app: FastifyInstance;
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

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await prisma.$connect();

    // Crear Usuario A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'usera_chars@burgoslabs.es',
        displayName: 'Usuario A',
        password: 'PasswordSegura123!',
      },
    });
    userACookie = resA.cookies[0]!.value;

    // Crear Usuario B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'userb_chars@burgoslabs.es',
        displayName: 'Usuario B',
        password: 'PasswordSegura123!',
      },
    });
    userBCookie = resB.cookies[0]!.value;

    // Crear DM
    const resDM = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'dm_chars@burgoslabs.es',
        displayName: 'DM Chars',
        password: 'PasswordSegura123!',
      },
    });
    dmCookie = resDM.cookies[0]!.value;

    // DM crea una campaña
    const campRes = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
      payload: {
        name: 'Campaña de Prueba',
        system: 'dnd5e',
      },
    });
    const campData = JSON.parse(campRes.body);
    campaignId = campData.campaign.id;
    const inviteCode = campData.campaign.inviteCode;

    // Usuario A se une a la campaña
    await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: { inviteCode },
    });
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

  let charAId: string;

  it('permite a Usuario A crear un personaje y asignarlo a una campaña donde es miembro', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: {
        name: 'Raistlin',
        system: 'dnd5e',
        campaignId,
        data: validDndData,
      },
    });

    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.character.name).toBe('Raistlin');
    expect(data.character.campaignId).toBe(campaignId);
    charAId = data.character.id;
  });

  it('rechaza asignar personaje a una campaña de la que NO es miembro (Usuario B)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Personaje Infiltrado',
        system: 'dnd5e',
        campaignId, // Usuario B no es miembro de esta campaña
        data: validDndData,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('no eres miembro');
  });

  it('rechaza la creación si data supera los 64 KB o incumple el esquema', async () => {
    // Incumple esquema (nivel 30)
    const badSchemaRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: {
        name: 'Nivel Ilegal',
        system: 'dnd5e',
        data: { ...validDndData, level: 30 },
      },
    });
    expect(badSchemaRes.statusCode).toBe(400);

    // Supera 64 KB
    const oversizedRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: {
        name: 'Demasiado Grande',
        system: 'dnd5e',
        data: { ...validDndData, notes: 'X'.repeat(66 * 1024) },
      },
    });
    expect(oversizedRes.statusCode).toBe(400);
    expect(JSON.parse(oversizedRes.body).message).toContain('64 KB');
  });

  it('GET /api/characters devuelve únicamente los personajes del usuario autenticado', async () => {
    // Usuario B crea su propio personaje
    await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Personaje de B',
        system: 'dnd5e',
        data: validDndData,
      },
    });

    const resA = await app.inject({
      method: 'GET',
      url: '/api/characters',
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(resA.statusCode).toBe(200);
    const dataA = JSON.parse(resA.body);
    expect(dataA.items.length).toBe(1);
    expect(dataA.items[0].name).toBe('Raistlin');

    const resB = await app.inject({
      method: 'GET',
      url: '/api/characters',
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
    });
    expect(resB.statusCode).toBe(200);
    const dataB = JSON.parse(resB.body);
    expect(dataB.items.length).toBe(1);
    expect(dataB.items[0].name).toBe('Personaje de B');
  });

  it('el DM de la campaña puede leer el personaje de A, pero un usuario ajeno recibe 404', async () => {
    // DM lee ficha de A (asignada a su campaña)
    const resDM = await app.inject({
      method: 'GET',
      url: `/api/characters/${charAId}`,
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
    });
    expect(resDM.statusCode).toBe(200);
    expect(JSON.parse(resDM.body).character.name).toBe('Raistlin');

    // Usuario B (no es DM ni propietario) recibe 404
    const resB = await app.inject({
      method: 'GET',
      url: `/api/characters/${charAId}`,
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
    });
    expect(resB.statusCode).toBe(404);
  });

  it('el DM NO puede editar ni borrar la ficha de A (recibe 404)', async () => {
    // DM intenta editar
    const resEdit = await app.inject({
      method: 'PUT',
      url: `/api/characters/${charAId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
      payload: { name: 'Nombre cambiado por DM' },
    });
    expect(resEdit.statusCode).toBe(404);

    // DM intenta borrar
    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/characters/${charAId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
    });
    expect(resDelete.statusCode).toBe(404);
  });

  it('el propietario (Usuario A) puede actualizar y borrar su personaje', async () => {
    // Actualizar
    const resUpdate = await app.inject({
      method: 'PUT',
      url: `/api/characters/${charAId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: { name: 'Raistlin Majere' },
    });
    expect(resUpdate.statusCode).toBe(200);
    expect(JSON.parse(resUpdate.body).character.name).toBe('Raistlin Majere');

    // Borrar
    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/characters/${charAId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(resDelete.statusCode).toBe(200);

    // Ya no existe
    const resGet = await app.inject({
      method: 'GET',
      url: `/api/characters/${charAId}`,
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(resGet.statusCode).toBe(404);
  });
});
