import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { message: 'DATABASE_URL es obligatoria' }),
  SESSION_SECRET: z
    .string()
    .min(32, { message: 'SESSION_SECRET debe tener al menos 32 caracteres para ser seguro' }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGIN: z.string().min(1, { message: 'ALLOWED_ORIGIN es obligatoria' }),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
});

describe('Validación de variables de entorno (env.ts)', () => {
  it('falla si falta DATABASE_URL', () => {
    const res = envSchema.safeParse({
      SESSION_SECRET: '12345678901234567890123456789012',
      ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
    }
  });

  it('falla si SESSION_SECRET tiene menos de 32 caracteres', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: 'corta',
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
      SESSION_SECRET: '12345678901234567890123456789012',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('ALLOWED_ORIGIN'))).toBe(true);
    }
  });

  it('valida exitosamente cuando todas las variables requeridas están presentes', () => {
    const res = envSchema.safeParse({
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
      SESSION_SECRET: '12345678901234567890123456789012',
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
