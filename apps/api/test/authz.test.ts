import { describe, it, expect } from 'vitest';
import {
  canReadCharacter,
  canEditCharacter,
  canManageCampaign,
  canReadCampaign,
  canAssignCharacterToCampaign,
} from '../src/lib/authz.js';

describe('Políticas de Autorización Centralizadas (authz.ts)', () => {
  const ownerId = 'user-owner-1';
  const otherUserId = 'user-intruder-2';
  const dmId = 'user-dm-3';
  const otherDmId = 'user-dm-other-4';

  const standaloneCharacter = {
    id: 'char-1',
    ownerId,
    campaignId: null,
    campaign: null,
  };

  const campaignCharacter = {
    id: 'char-2',
    ownerId,
    campaignId: 'camp-1',
    campaign: { dmId },
  };

  describe('canReadCharacter', () => {
    it('el propietario siempre puede leer su ficha', () => {
      expect(canReadCharacter(ownerId, standaloneCharacter)).toBe(true);
      expect(canReadCharacter(ownerId, campaignCharacter)).toBe(true);
    });

    it('un usuario ajeno no puede leer una ficha no asignada', () => {
      expect(canReadCharacter(otherUserId, standaloneCharacter)).toBe(false);
    });

    it('el DM de la campaña asignada puede leer la ficha', () => {
      expect(canReadCharacter(dmId, campaignCharacter)).toBe(true);
    });

    it('el DM de OTRA campaña no puede leer la ficha', () => {
      expect(canReadCharacter(otherDmId, campaignCharacter)).toBe(false);
    });
  });

  describe('canEditCharacter', () => {
    it('solo el propietario puede editar la ficha', () => {
      expect(canEditCharacter(ownerId, standaloneCharacter)).toBe(true);
      expect(canEditCharacter(ownerId, campaignCharacter)).toBe(true);
    });

    it('el DM NO puede editar las fichas de los jugadores de su campaña', () => {
      expect(canEditCharacter(dmId, campaignCharacter)).toBe(false);
    });

    it('un usuario tercero no puede editar la ficha', () => {
      expect(canEditCharacter(otherUserId, campaignCharacter)).toBe(false);
    });
  });

  describe('canManageCampaign', () => {
    const campaign = { id: 'camp-1', dmId };

    it('el DM puede gestionar la campaña', () => {
      expect(canManageCampaign(dmId, campaign)).toBe(true);
    });

    it('un jugador o usuario cualquiera no puede gestionar la campaña', () => {
      expect(canManageCampaign(ownerId, campaign)).toBe(false);
      expect(canManageCampaign(otherUserId, campaign)).toBe(false);
    });
  });

  describe('canReadCampaign', () => {
    const campaignWithMembers = {
      id: 'camp-1',
      dmId,
      members: [{ userId: ownerId }, { userId: 'player-2' }],
    };

    it('el DM puede leer su campaña', () => {
      expect(canReadCampaign(dmId, campaignWithMembers)).toBe(true);
    });

    it('los miembros de la campaña pueden leer la campaña', () => {
      expect(canReadCampaign(ownerId, campaignWithMembers)).toBe(true);
    });

    it('un usuario no perteneciente no puede leer la campaña', () => {
      expect(canReadCampaign(otherUserId, campaignWithMembers)).toBe(false);
    });
  });

  describe('canAssignCharacterToCampaign', () => {
    it('el propietario puede asignar su ficha si es miembro de la campaña', () => {
      expect(canAssignCharacterToCampaign(ownerId, ownerId, true)).toBe(true);
    });

    it('el propietario NO puede asignar su ficha a una campaña de la que no es miembro', () => {
      expect(canAssignCharacterToCampaign(ownerId, ownerId, false)).toBe(false);
    });

    it('un usuario no puede asignar la ficha de otra persona', () => {
      expect(canAssignCharacterToCampaign(otherUserId, ownerId, true)).toBe(false);
    });
  });
});
