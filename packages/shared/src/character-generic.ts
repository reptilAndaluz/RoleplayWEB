import { z } from 'zod';

export const GenericTraitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().max(1000),
});

export const GenericInventoryItemSchema = z.object({
  item: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(9999).default(1),
  notes: z.string().max(500).optional(),
});

export const GenericCharacterDataSchema = z.object({
  description: z.string().max(1000).default(''),
  stats: z
    .record(
      z.string().min(1).max(50),
      z.union([z.string().max(500), z.number().min(-99999).max(99999)]),
    )
    .default({}),
  traits: z.array(GenericTraitSchema).max(50).default([]),
  inventory: z.array(GenericInventoryItemSchema).max(100).default([]),
  notes: z.string().max(10000).default(''),
});

export type GenericCharacterData = z.infer<typeof GenericCharacterDataSchema>;
