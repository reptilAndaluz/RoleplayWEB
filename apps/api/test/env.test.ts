import { describe, it, expect } from 'vitest';
import { envSchema } from '../src/config/env.js';

describe('Validación de variables de entorno (env.ts)', () => {
  it('falla si falta DATABASE_URL', () => {
    const res = envSchema.safeParse({
      DIRECT_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
      CRON_SECRET: 'secret_cron_123456',
      ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
    }
  });

  it('falla si falta DIRECT_URL', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
      CRON_SECRET: 'secret_cron_123456',
      ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('DIRECT_URL'))).toBe(true);
    }
  });

  it('falla si falta CRON_SECRET', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      DIRECT_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
      ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('CRON_SECRET'))).toBe(true);
    }
  });

  it('falla si SESSION_SECRET tiene menos de 32 caracteres', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      DIRECT_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: 'corta',
      CRON_SECRET: 'secret_cron_123456',
      ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('SESSION_SECRET'))).toBe(true);
    }
  });

  it('falla si falta ALLOWED_ORIGIN', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      DIRECT_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
      CRON_SECRET: 'secret_cron_123456',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('ALLOWED_ORIGIN'))).toBe(true);
    }
  });

  it('valida exitosamente cuando todas las variables requeridas están presentes', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      DIRECT_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
      CRON_SECRET: 'secret_cron_123456',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.PORT).toBe(3000);
      expect(res.data.HOST).toBe('0.0.0.0');
    }
  });
});
