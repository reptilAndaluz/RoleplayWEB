import { describe, it, expect } from 'vitest';
import { CreateCampaignInputSchema, JoinCampaignInputSchema } from '../src/campaign.js';

describe('Shared Campaign Schemas', () => {
  describe('CreateCampaignInputSchema', () => {
    it('acepta datos de campaña válidos', () => {
      const res = CreateCampaignInputSchema.safeParse({
        name: 'La Mina Perdida de Phandelver',
        system: 'dnd5e',
      });
      expect(res.success).toBe(true);
    });

    it('rechaza nombres menores a 2 caracteres o mayores a 100', () => {
      expect(
        CreateCampaignInputSchema.safeParse({
          name: 'A',
          system: 'dnd5e',
        }).success,
      ).toBe(false);

      expect(
        CreateCampaignInputSchema.safeParse({
          name: 'X'.repeat(101),
          system: 'dnd5e',
        }).success,
      ).toBe(false);
    });

    it('rechaza sistemas menores a 2 caracteres o mayores a 50', () => {
      expect(
        CreateCampaignInputSchema.safeParse({
          name: 'Campaña Válida',
          system: 'd',
        }).success,
      ).toBe(false);

      expect(
        CreateCampaignInputSchema.safeParse({
          name: 'Campaña Válida',
          system: 'S'.repeat(51),
        }).success,
      ).toBe(false);
    });
  });

  describe('JoinCampaignInputSchema', () => {
    it('acepta código de invitación válido', () => {
      const res = JoinCampaignInputSchema.safeParse({
        inviteCode: 'CAMP-ABC-1234',
      });
      expect(res.success).toBe(true);
    });

    it('falla con código de invitación menor a 4 caracteres', () => {
      const res = JoinCampaignInputSchema.safeParse({
        inviteCode: '123',
      });
      expect(res.success).toBe(false);
    });
  });
});
