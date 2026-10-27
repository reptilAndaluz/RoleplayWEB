import { z } from 'zod';
import { Dnd5eCharacterDataSchema, type Dnd5eCharacterData } from './character-dnd5e.js';
import { GenericCharacterDataSchema, type GenericCharacterData } from './character-generic.js';

export const MAX_CHARACTER_DATA_BYTES = 64 * 1024; // 64 KB

export function getJsonByteLength(val: unknown): number {
  if (val === undefined || val === null) return 0;
  const json = typeof val === 'string' ? val : JSON.stringify(val);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(json).length;
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(json, 'utf8');
  }
  return json.length;
}

export function validateCharacterDataBySystem(system: string, data: unknown) {
  const byteLength = getJsonByteLength(data);
  if (byteLength > MAX_CHARACTER_DATA_BYTES) {
    return {
      success: false as const,
      error: `El tamaño de los datos (${byteLength} bytes) excede el límite máximo permitido de 64 KB (65536 bytes)`,
    };
  }

  if (system.toLowerCase() === 'dnd5e') {
    const parsed = Dnd5eCharacterDataSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
        issues: parsed.error.issues,
      };
    }
    return { success: true as const, data: parsed.data };
  }

  // Otros sistemas: validar contra esquema genérico
  const parsed = GenericCharacterDataSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
      issues: parsed.error.issues,
    };
  }
  return { success: true as const, data: parsed.data };
}

export const CreateCharacterInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'El nombre del personaje es obligatorio' })
      .max(100, { message: 'El nombre no puede exceder 100 caracteres' }),
    system: z
      .string()
      .trim()
      .min(1, { message: 'El sistema es obligatorio' })
      .max(50, { message: 'El sistema no puede exceder 50 caracteres' }),
    campaignId: z
      .string()
      .uuid({ message: 'El id de campaña debe ser un UUID válido' })
      .nullable()
      .optional(),
    data: z.unknown(),
  })
  .superRefine((val, ctx) => {
    const res = validateCharacterDataBySystem(val.system, val.data);
    if (!res.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error,
        path: ['data'],
      });
    }
  });

export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

export const UpdateCharacterInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'El nombre no puede estar vacío' })
      .max(100, { message: 'El nombre no puede exceder 100 caracteres' })
      .optional(),
    campaignId: z.string().uuid().nullable().optional(),
    system: z.string().trim().min(1).max(50).optional(),
    data: z.unknown().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.data !== undefined) {
      const system = val.system ?? 'dnd5e';
      const res = validateCharacterDataBySystem(system, val.data);
      if (!res.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error,
          path: ['data'],
        });
      }
    }
  });

export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInputSchema>;

export const CharacterPublicSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  campaignId: z.string().uuid().nullable(),
  system: z.string(),
  name: z.string(),
  data: z.unknown(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type CharacterPublic = z.infer<typeof CharacterPublicSchema>;
export type CharacterData = Dnd5eCharacterData | GenericCharacterData;
