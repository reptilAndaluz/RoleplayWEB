import { z } from 'zod';
import { UserPublicSchema } from './auth.js';

export const CampaignRoleSchema = z.enum(['DM', 'PLAYER']);
export type CampaignRole = z.infer<typeof CampaignRoleSchema>;

export const CreateCampaignInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'El nombre de la campaña debe tener al menos 2 caracteres' })
    .max(100, { message: 'El nombre de la campaña no puede superar los 100 caracteres' }),
  system: z
    .string()
    .trim()
    .min(2, { message: 'El sistema debe tener al menos 2 caracteres' })
    .max(50, { message: 'El sistema no puede superar los 50 caracteres' }),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const JoinCampaignInputSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4, { message: 'El código de invitación debe tener al menos 4 caracteres' })
    .max(64, { message: 'El código de invitación no puede superar los 64 caracteres' }),
});

export type JoinCampaignInput = z.infer<typeof JoinCampaignInputSchema>;

export const CampaignMemberPublicSchema = z.object({
  campaignId: z.string().uuid(),
  userId: z.string().uuid(),
  role: CampaignRoleSchema,
  user: UserPublicSchema.optional(),
});

export type CampaignMemberPublic = z.infer<typeof CampaignMemberPublicSchema>;

export const CampaignPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  system: z.string(),
  inviteCode: z.string(),
  dmId: z.string().uuid(),
  createdAt: z.union([z.string(), z.date()]),
  dm: UserPublicSchema.optional(),
  members: z.array(CampaignMemberPublicSchema).optional(),
});

export type CampaignPublic = z.infer<typeof CampaignPublicSchema>;
