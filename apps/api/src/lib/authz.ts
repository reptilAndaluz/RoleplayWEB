export interface CharacterAuthzContext {
  id?: string;
  ownerId: string;
  campaignId?: string | null;
  campaign?: {
    dmId: string;
  } | null;
}

export interface CampaignAuthzContext {
  id?: string;
  dmId: string;
  members?: Array<{ userId: string }>;
}

/**
 * Regla: Una ficha puede ser leída por su propietario, o por el DM de la campaña a la que esté asignada.
 */
export function canReadCharacter(userId: string, character: CharacterAuthzContext): boolean {
  if (!userId) return false;
  if (character.ownerId === userId) {
    return true;
  }
  if (character.campaign && character.campaign.dmId === userId) {
    return true;
  }
  return false;
}

/**
 * Regla: Solo el propietario de la ficha puede editarla o borrarla.
 */
export function canEditCharacter(userId: string, character: CharacterAuthzContext): boolean {
  if (!userId) return false;
  return character.ownerId === userId;
}

/**
 * Regla: Solo el DM puede gestionar, actualizar o borrar la campaña.
 */
export function canManageCampaign(userId: string, campaign: CampaignAuthzContext): boolean {
  if (!userId) return false;
  return campaign.dmId === userId;
}

/**
 * Regla: La campaña puede ser leída por su DM y por los miembros que pertenezcan a ella.
 */
export function canReadCampaign(userId: string, campaign: CampaignAuthzContext): boolean {
  if (!userId) return false;
  if (campaign.dmId === userId) {
    return true;
  }
  if (campaign.members && campaign.members.some((m) => m.userId === userId)) {
    return true;
  }
  return false;
}

/**
 * Regla: Un personaje solo puede ser asignado a una campaña por su propietario,
 * y este debe ser miembro de dicha campaña.
 */
export function canAssignCharacterToCampaign(
  userId: string,
  characterOwnerId: string,
  isMemberOfCampaign: boolean,
): boolean {
  if (!userId) return false;
  if (characterOwnerId !== userId) {
    return false;
  }
  return isMemberOfCampaign;
}
