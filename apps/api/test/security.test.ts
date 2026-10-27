import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { SESSION_COOKIE_NAME } from '../src/lib/tokens.js';
import type { Hono } from 'hono';

describe('Tests de Seguridad Obligatorios (Sección 6 del Plan - 9 Requisitos)', () => {
  let app: Hono;
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

    // 1. Usuario A
    const resA = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '40.0.0.1',
      },
      body: JSON.stringify({
        email: 'sec_usera@burgoslabs.es',
        displayName: 'Usuario A',
        password: 'PasswordSegura123!',
      }),
    });
    userACookie = getCookieHeader(resA);

    // 2. Usuario B
    const resB = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '40.0.0.2',
      },
      body: JSON.stringify({
        email: 'sec_userb@burgoslabs.es',
        displayName: 'Usuario B',
        password: 'PasswordSegura123!',
      }),
    });
    userBCookie = getCookieHeader(resB);

    // 3. DM 1 (crea campaña 1)
    const resDm = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '40.0.0.3',
      },
      body: JSON.stringify({
        email: 'sec_dm@burgoslabs.es',
        displayName: 'Dungeon Master 1',
        password: 'PasswordSegura123!',
      }),
    });
    dmCookie = getCookieHeader(resDm);

    const camp1Res = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: dmCookie,
      },
      body: JSON.stringify({
        name: 'Campaña 1 Oficial',
        system: 'dnd5e',
      }),
    });
    const camp1Data = await camp1Res.json();
    campaign1Id = camp1Data.campaign.id;

    // 4. DM 2 (crea campaña 2)
    const resOtherDm = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': '40.0.0.4',
      },
      body: JSON.stringify({
        email: 'sec_otherdm@burgoslabs.es',
        displayName: 'Dungeon Master 2',
        password: 'PasswordSegura123!',
      }),
    });
    otherDmCookie = getCookieHeader(resOtherDm);

    const camp2Res = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: otherDmCookie,
      },
      body: JSON.stringify({
        name: 'Campaña 2 Ajena',
        system: 'dnd5e',
      }),
    });
    const camp2Data = await camp2Res.json();
    campaign2Id = camp2Data.campaign.id;

    // Crear Ficha de Usuario B (no asignada)
    const charBRes = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userBCookie,
      },
      body: JSON.stringify({
        name: 'Ficha de Usuario B',
        system: 'dnd5e',
        data: validDndData,
      }),
    });
    const charBData = await charBRes.json();
    charBId = charBData.character.id;

    // Usuario B se une a Campaña 1 y asigna una ficha
    await app.request('/api/campaigns/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userBCookie,
      },
      body: JSON.stringify({
        inviteCode: camp1Data.campaign.inviteCode,
      }),
    });

    const charCamp1Res = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userBCookie,
      },
      body: JSON.stringify({
        name: 'Ficha en Campaña 1',
        system: 'dnd5e',
        campaignId: campaign1Id,
        data: validDndData,
      }),
    });
    const charCamp1Data = await charCamp1Res.json();
    charInCamp1Id = charCamp1Data.character.id;
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

  // TEST 1
  it('1. Un usuario A no puede leer, editar ni borrar una ficha de B (esperado: 404)', async () => {
    // Leer ficha ajena
    const readRes = await app.request(`/api/characters/${charBId}`, {
      method: 'GET',
      headers: { Cookie: userACookie },
    });
    expect(readRes.status).toBe(404);

    // Editar ficha ajena
    const editRes = await app.request(`/api/characters/${charBId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({ name: 'Hackeado por A' }),
    });
    expect(editRes.status).toBe(404);

    // Borrar ficha ajena
    const deleteRes = await app.request(`/api/characters/${charBId}`, {
      method: 'DELETE',
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
    });
    expect(deleteRes.status).toBe(404);
  });

  // TEST 2
  it('2. Un usuario sin sesión recibe 401 en todas las rutas protegidas', async () => {
    const resGetChars = await app.request('/api/characters', { method: 'GET' });
    expect(resGetChars.status).toBe(401);

    const resPostChar = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ name: 'Sin sesion', system: 'dnd5e', data: validDndData }),
    });
    expect(resPostChar.status).toBe(401);

    const resGetCamps = await app.request('/api/campaigns', { method: 'GET' });
    expect(resGetCamps.status).toBe(401);

    const resMe = await app.request('/api/auth/me', { method: 'GET' });
    expect(resMe.status).toBe(401);
  });

  // TEST 3
  it('3. Una sesión caducada o borrada es rechazada con 401', async () => {
    const expiredRes = await app.request('/api/characters', {
      method: 'GET',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=token_inexistente_o_caducado_12345`,
      },
    });
    expect(expiredRes.status).toBe(401);
  });

  // TEST 4
  it('4. El DM puede leer, pero no editar, las fichas de su campaña; un DM de otra campaña no puede leerlas', async () => {
    // 4.1 DM de la Campaña 1 PUEDE leer la ficha asignada
    const dmReadRes = await app.request(`/api/characters/${charInCamp1Id}`, {
      method: 'GET',
      headers: { Cookie: dmCookie },
    });
    expect(dmReadRes.status).toBe(200);

    // 4.2 DM de la Campaña 1 NO PUEDE editar la ficha asignada (solo el propietario puede)
    const dmEditRes = await app.request(`/api/characters/${charInCamp1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: dmCookie,
      },
      body: JSON.stringify({ name: 'Nombre cambiado por DM' }),
    });
    expect(dmEditRes.status).toBe(404);

    // 4.3 DM de OTRA campaña (Campaña 2) NO PUEDE leer la ficha de Campaña 1
    const otherDmReadRes = await app.request(`/api/characters/${charInCamp1Id}`, {
      method: 'GET',
      headers: { Cookie: otherDmCookie },
    });
    expect(otherDmReadRes.status).toBe(404);
  });

  // TEST 5
  it('5. No se puede asignar una ficha a una campaña de la que el usuario no es miembro', async () => {
    const res = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Ficha Ilegal',
        system: 'dnd5e',
        campaignId: campaign2Id, // Usuario A NO es miembro de Campaña 2
        data: validDndData,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('no eres miembro');
  });

  // TEST 6
  it('6. Un data que excede 64 KB o incumple el esquema es rechazado con 400', async () => {
    // 6.1 Incumple el esquema
    const badSchemaRes = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Ficha Rota',
        system: 'dnd5e',
        data: { nivel: 999 }, // Invalido
      }),
    });
    expect(badSchemaRes.status).toBe(400);

    // 6.2 Excede 64 KB en data
    const oversizedNotes = 'A'.repeat(70 * 1024);
    const largeData = {
      ...validDndData,
      notes: oversizedNotes,
    };

    const oversizedRes = await app.request('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        Cookie: userACookie,
      },
      body: JSON.stringify({
        name: 'Ficha Gigante',
        system: 'dnd5e',
        data: largeData,
      }),
    });

    expect(oversizedRes.status).toBe(400);
    const body = await oversizedRes.json();
    expect(body.message).toContain('64 KB');
  });

  // TEST 7
  it('7. Superar el límite de intentos de login devuelve 429, también entre invocaciones distintas (el contador vive en BD)', async () => {
    const testIp = '198.51.100.99';
    await prisma.rateLimit.deleteMany({ where: { key: `login:${testIp}` } });

    // Enviar 5 intentos
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.ALLOWED_ORIGIN,
          'x-real-ip': testIp,
        },
        body: JSON.stringify({
          email: 'sec_usera@burgoslabs.es',
          password: 'PasswordErronea!',
        }),
      });
      expect(res.status).toBe(401);
    }

    // El 6º intento debe ser bloqueado con 429 Too Many Requests
    const blockedRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env.ALLOWED_ORIGIN,
        'x-real-ip': testIp,
      },
      body: JSON.stringify({
        email: 'sec_usera@burgoslabs.es',
        password: 'PasswordSegura123!',
      }),
    });

    expect(blockedRes.status).toBe(429);
    const body = await blockedRes.json();
    expect(body.error).toBe('Too Many Requests');

    // Verificar que el registro está persistido en la BD
    const rateLimitRow = await prisma.rateLimit.findUnique({
      where: { key: `login:${testIp}` },
    });
    expect(rateLimitRow).not.toBeNull();
    expect(rateLimitRow?.count).toBeGreaterThanOrEqual(5);
  });

  // TEST 8
  it('8. Petición mutante con Origin no permitido o ausente es rechazada con 403', async () => {
    // 8.1 Sin Origin
    const noOriginRes = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({ name: 'Campaña Sin Origin', system: 'dnd5e' }),
    });
    expect(noOriginRes.status).toBe(403);

    // 8.2 Origin diferente
    const badOriginRes = await app.request('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-site.org',
        Cookie: userACookie,
      },
      body: JSON.stringify({ name: 'Campaña Bad Origin', system: 'dnd5e' }),
    });
    expect(badOriginRes.status).toBe(403);
  });

  // TEST 9
  it('9. El endpoint de cron rechaza peticiones sin CRON_SECRET válido con 401', async () => {
    // 9.1 Sin cabecera Authorization
    const unauthCron = await app.request('/api/cron/cleanup', {
      method: 'GET',
    });
    expect(unauthCron.status).toBe(401);

    // 9.2 Con token incorrecto
    const badSecretCron = await app.request('/api/cron/cleanup', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token_falso_invalido',
      },
    });
    expect(badSecretCron.status).toBe(401);

    // 9.3 Con CRON_SECRET correcto
    const validCron = await app.request('/api/cron/cleanup', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    });
    expect(validCron.status).toBe(200);
    const body = await validCron.json();
    expect(body.ok).toBe(true);
    expect(body.deletedSessions).toBeDefined();
    expect(body.deletedRateLimits).toBeDefined();

    // 9.4 Falla cerrado si el token enviado está vacío
    const emptyCron = await app.request('/api/cron/cleanup', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ',
      },
    });
    expect(emptyCron.status).toBe(401);
  });
});
