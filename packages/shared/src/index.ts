export * from './auth.js';
export * from './campaign.js';
export * from './character-dnd5e.js';
export * from './character-generic.js';
export * from './character.js';

// Esquema de salud
import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
});

export type Health = z.infer<typeof HealthSchema>;
