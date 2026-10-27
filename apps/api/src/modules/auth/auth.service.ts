import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword, hashToken } from '../../lib/hash.js';
import { generateSessionToken, SESSION_TTL_MS } from '../../lib/tokens.js';
import type { RegisterInput, LoginInput, UserPublic } from '@rol/shared';

export class AuthService {
  async register(
    input: RegisterInput,
  ): Promise<{ user: UserPublic; token: string; expiresAt: Date }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      const error = new Error('El correo electrónico ya está registrado');
      (error as Error & { statusCode: number }).statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        displayName: input.displayName.trim(),
        passwordHash,
      },
    });

    // Generar sesión inmediata tras registro
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      token,
      expiresAt,
    };
  }

  async login(
    input: LoginInput,
    previousToken?: string,
  ): Promise<{ user: UserPublic; token: string; expiresAt: Date }> {
    const genericError = new Error('Credenciales inválidas');
    (genericError as Error & { statusCode: number }).statusCode = 401;

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) {
      // Usar verify con hash dummy para mitigar ataques de temporización
      await verifyPassword(
        '$argon2id$v=19$m=65536,t=3,p=4$dummyhashdummyhashdummy$dummyhashdummyhashdummyhashdummy',
        input.password,
      );
      throw genericError;
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw genericError;
    }

    // Rotación de sesión: si había un token previo, eliminar la sesión antigua
    if (previousToken) {
      try {
        const oldHash = hashToken(previousToken);
        await prisma.session.deleteMany({ where: { tokenHash: oldHash } });
      } catch {
        // Ignorar si no existía
      }
    }

    // Generar nuevo token de sesión seguro
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      token,
      expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({
      where: { tokenHash },
    });
  }

  async getSessionUser(token: string): Promise<UserPublic | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) return null;

    // Verificar si ha caducado
    if (new Date() > session.expiresAt) {
      // Eliminar sesión caducada
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      createdAt: session.user.createdAt,
    };
  }
}

export const authService = new AuthService();
