import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { RegisterInputSchema, LoginInputSchema } from '@rol/shared';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword, hashToken } from '../../lib/hash.js';
import { generateSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../lib/tokens.js';
import { createDbRateLimiter } from '../../middleware/rate-limit.js';
import { authMiddleware, type AuthContextVariables } from '../../middleware/auth.js';
import { env } from '../../config/env.js';

export const authModule = new Hono<{ Variables: AuthContextVariables }>();

// Hash de prueba constante para mitigar enumeración por timing attacks
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9Z8Z3v+R4wXyT+z7X9v6A0a1B2c3D4e5F6g7H8i9J0k';

// POST /api/auth/register
authModule.post('/register', createDbRateLimiter({ prefix: 'register', max: 5 }), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parseResult = RegisterInputSchema.safeParse(body);

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

  const { email, displayName, password } = parseResult.data;

  // Comprobar colisión de correo
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    return c.json(
      {
        statusCode: 409,
        error: 'Conflict',
        message: 'El correo electrónico ya se encuentra registrado',
      },
      409
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      displayName,
      passwordHash,
    },
  });

  // Generar sesión de 32 bytes y guardar solo SHA-256
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    },
    201
  );
});

// POST /api/auth/login
authModule.post('/login', createDbRateLimiter({ prefix: 'login', max: 5 }), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parseResult = LoginInputSchema.safeParse(body);

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

  const { email, password } = parseResult.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Timing attack mitigation: verificar siempre
  const targetHash = user ? user.passwordHash : DUMMY_HASH;
  const isMatch = await verifyPassword(targetHash, password);

  if (!user || !isMatch) {
    return c.json(
      {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Credenciales inválidas',
      },
      401
    );
  }

  // Rotar sesiones previas del usuario
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  // Crear nueva sesión
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    },
    200
  );
});

// POST /api/auth/logout
authModule.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({
      where: { tokenHash },
    });
  }

  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
  });

  return c.json({ message: 'Sesión cerrada correctamente' }, 200);
});

// GET /api/auth/me
authModule.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    },
    200
  );
});
