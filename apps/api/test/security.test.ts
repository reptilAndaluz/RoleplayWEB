import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { FastifyInstance } from 'fastify';

describe('Tests de Seguridad Obligatorios (Sección 6 del Plan)', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userBCookie: string;
  let dmCookie: string;
  let otherDmCookie: string;

  let campaign1Id: string;
  let campaign2Id: string;
  let charBId: string;
  let charInCamp1Id: string;

  const validDndData = {
    class: 'Pícaro',
    level: 4,
    race: 'Mediano',
    background: 'Criminal',
    attributes: {
      strength: 10,
      dexterity: 17,
      constitution: 14,
      intelligence: 12,
      wisdom: 10,
      charisma: 14,
    },
    armorClass: 15,
    speed: 25,
    hitPoints: {
      current: 27,
      max: 27,
    },
  };

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    await prisma.$connect();

    // 1. Usuario A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'sec_usera@burgoslabs.es',
        displayName: 'Usuario A',
        password: 'PasswordSegura123!',
      },
    });
    userACookie = resA.cookies[0]!.value;

    // 2. Usuario B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'sec_userb@burgoslabs.es',
        displayName: 'Usuario B',
        password: 'PasswordSegura123!',
      },
    });
    userBCookie = resB.cookies[0]!.value;

    // 3. DM Campaña 1
    const resDM1 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'sec_dm1@burgoslabs.es',
        displayName: 'DM 1',
        password: 'PasswordSegura123!',
      },
    });
    dmCookie = resDM1.cookies[0]!.value;

    // 4. DM Campaña 2
    const resDM2 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: env.ALLOWED_ORIGIN },
      payload: {
        email: 'sec_dm2@burgoslabs.es',
        displayName: 'DM 2',
        password: 'PasswordSegura123!',
      },
    });
    otherDmCookie = resDM2.cookies[0]!.value;

    // DM 1 crea Campaña 1
    const camp1Res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
      payload: { name: 'Campaña 1', system: 'dnd5e' },
    });
    const camp1Data = JSON.parse(camp1Res.body).campaign;
    campaign1Id = camp1Data.id;

    // DM 2 crea Campaña 2
    const camp2Res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: otherDmCookie },
      payload: { name: 'Campaña 2', system: 'dnd5e' },
    });
    campaign2Id = JSON.parse(camp2Res.body).campaign.id;

    // Usuario B se une a Campaña 1
    await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: { inviteCode: camp1Data.inviteCode },
    });

    // Usuario B crea una ficha libre
    const charBRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Ficha B Libre',
        system: 'dnd5e',
        data: validDndData,
      },
    });
    charBId = JSON.parse(charBRes.body).character.id;

    // Usuario B crea una ficha asignada a Campaña 1
    const charInCampRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Ficha B en Campaña 1',
        system: 'dnd5e',
        campaignId: campaign1Id,
        data: validDndData,
      },
    });
    charInCamp1Id = JSON.parse(charInCampRes.body).character.id;
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

  // Test 1: Un usuario A no puede leer, editar ni borrar una ficha de B (esperado: 404)
  it('1. Un usuario A no puede leer, editar ni borrar una ficha de B (esperado: 404)', async () => {
    // Leer
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/characters/${charBId}`,
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(getRes.statusCode).toBe(404);

    // Editar
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/characters/${charBId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
      payload: { name: 'Hackeado por A' },
    });
    expect(putRes.statusCode).toBe(404);

    // Borrar
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/characters/${charBId}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(deleteRes.statusCode).toBe(404);
  });

  // Test 2: Un usuario sin sesión recibe 401 en todas las rutas protegidas
  it('2. Un usuario sin sesión recibe 401 en todas las rutas protegidas', async () => {
    const resAuth = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(resAuth.statusCode).toBe(401);

    const resChars = await app.inject({ method: 'GET', url: '/api/characters' });
    expect(resChars.statusCode).toBe(401);

    const resCamps = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(resCamps.statusCode).toBe(401);
  });

  // Test 3: Una sesión caducada o borrada es rechazada
  it('3. Una sesión caducada o borrada es rechazada', async () => {
    // Sesión borrada
    const invalidCookieRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: 'token_inventado_totalmente_inexistente' },
    });
    expect(invalidCookieRes.statusCode).toBe(401);

    // Sesión caducada
    await prisma.session.updateMany({
      where: { user: { email: 'sec_usera@burgoslabs.es' } },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    const expiredRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: userACookie },
    });
    expect(expiredRes.statusCode).toBe(401);
  });

  // Test 4: El DM puede leer, pero no editar, las fichas de su campaña; un DM de otra campaña no puede leerlas
  it('4. El DM puede leer, pero no editar, las fichas de su campaña; un DM de otra campaña no puede leerlas', async () => {
    // DM 1 lee la ficha de su campaña -> 200
    const dmReadRes = await app.inject({
      method: 'GET',
      url: `/api/characters/${charInCamp1Id}`,
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
    });
    expect(dmReadRes.statusCode).toBe(200);

    // DM 1 intenta editar la ficha de su campaña -> 404 (solo el propietario puede editar)
    const dmEditRes = await app.inject({
      method: 'PUT',
      url: `/api/characters/${charInCamp1Id}`,
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: dmCookie },
      payload: { name: 'Nombre alterado por DM' },
    });
    expect(dmEditRes.statusCode).toBe(404);

    // DM 2 (de otra campaña) intenta leer la ficha de Campaña 1 -> 404
    const otherDmReadRes = await app.inject({
      method: 'GET',
      url: `/api/characters/${charInCamp1Id}`,
      cookies: { [SESSION_COOKIE_NAME]: otherDmCookie },
    });
    expect(otherDmReadRes.statusCode).toBe(404);
  });

  // Test 5: No se puede asignar una ficha a una campaña de la que el usuario no es miembro
  it('5. No se puede asignar una ficha a una campaña de la que el usuario no es miembro', async () => {
    // Usuario B intenta asignar una ficha a Campaña 2 (de la que no es miembro)
    const res = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Ficha para campaña ajena',
        system: 'dnd5e',
        campaignId: campaign2Id, // no es miembro
        data: validDndData,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('no eres miembro');
  });

  // Test 6: Un data que excede 64 KB o incumple el esquema es rechazado con 400
  it('6. Un data que excede 64 KB o incumple el esquema es rechazado con 400', async () => {
    // Incumple esquema (atributo 35)
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Fuerza Ilegal',
        system: 'dnd5e',
        data: {
          ...validDndData,
          attributes: { ...validDndData.attributes, strength: 35 },
        },
      },
    });
    expect(invalidRes.statusCode).toBe(400);

    // Supera 64 KB
    const oversizedRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: env.ALLOWED_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Ficha Gigante',
        system: 'dnd5e',
        data: {
          ...validDndData,
          notes: 'Z'.repeat(66 * 1024),
        },
      },
    });
    expect(oversizedRes.statusCode).toBe(400);
  });

  // Test 7: Superar el límite de intentos de login devuelve 429
  it('7. Superar el límite de intentos de login devuelve 429', async () => {
    const ip = '198.51.100.99';
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          origin: env.ALLOWED_ORIGIN,
          'cf-connecting-ip': ip,
        },
        payload: {
          email: 'sec_usera@burgoslabs.es',
          password: 'PasswordErronea!',
        },
      });
    }

    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: env.ALLOWED_ORIGIN,
        'cf-connecting-ip': ip,
      },
      payload: {
        email: 'sec_usera@burgoslabs.es',
        password: 'PasswordErronea!',
      },
    });

    expect(blockedRes.statusCode).toBe(429);
  });

  // Test 8: Petición mutante con Origin no permitido es rechazada
  it('8. Petición mutante con Origin no permitido es rechazada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { origin: 'https://origen-no-autorizado.com' },
      cookies: { [SESSION_COOKIE_NAME]: userBCookie },
      payload: {
        name: 'Ficha Bloqueada',
        system: 'dnd5e',
        data: validDndData,
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
