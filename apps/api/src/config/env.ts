import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'node:path';

// Cargar .env desde la raíz del monorepo si existe
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { message: 'DATABASE_URL es obligatoria' }),
  DIRECT_URL: z.string().min(1, { message: 'DIRECT_URL es obligatoria' }),
  SESSION_SECRET: z
    .string()
    .min(32, { message: 'SESSION_SECRET debe tener al menos 32 caracteres para ser seguro' }),
  CRON_SECRET: z.string().min(16, { message: 'CRON_SECRET es obligatorio' }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGIN: z.string().min(1, { message: 'ALLOWED_ORIGIN es obligatoria' }),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Error fatal de configuración: Variables de entorno inválidas o faltantes:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const env = (parsed.success ? parsed.data : {}) as z.infer<typeof envSchema>;
export type Env = z.infer<typeof envSchema>;
export { envSchema };
