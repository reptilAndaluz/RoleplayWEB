import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'rol_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días en segundos
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export function generateSessionToken(): string {
  // 32 bytes de entropía criptográfica segura
  return crypto.randomBytes(32).toString('hex');
}
