import { describe, it, expect } from 'vitest';
import {
  Dnd5eCharacterDataSchema,
  CreateCharacterInputSchema,
  UpdateCharacterInputSchema,
  validateCharacterDataBySystem,
  MAX_CHARACTER_DATA_BYTES,
  getJsonByteLength,
} from '../src/index.js';

describe('Shared Character Schemas', () => {
  const validDndData = {
    class: 'Paladín',
    level: 5,
    race: 'Humano',
    background: 'Noble',
    alignment: 'Legal Bueno',
    experiencePoints: 6500,
    attributes: {
      strength: 16,
      dexterity: 10,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 16,
    },
    armorClass: 18,
    speed: 30,
    initiative: 0,
    hitPoints: {
      current: 44,
      max: 44,
      temp: 0,
    },
    hitDice: '5d10',
    proficiencies: {
      proficiencyBonus: 3,
      savingThrows: ['Sabiduría', 'Carisma'],
      skills: ['Persuasión', 'Atletismo', 'Religión'],
      passivePerception: 11,
      languages: ['Común', 'Celestial'],
    },
    attacks: [
      {
        name: 'Espada Larga',
        bonus: 6,
        damage: '1d8+3',
        type: 'Cortante',
      },
    ],
    inventory: {
      items: [
        { name: 'Cota de malla', quantity: 1, weight: 55 },
        { name: 'Símbolo sagrado', quantity: 1, weight: 1 },
      ],
      currency: { cp: 10, sp: 5, ep: 0, gp: 50, pp: 0 },
    },
    traits: [
      {
        name: 'Sentir el Mal',
        description: 'Detecta presencias celestiales, demoníacas o no muertas.',
      },
    ],
    notes: 'Miembro devoto de la orden del Fénix.',
  };

  describe('Dnd5eCharacterDataSchema', () => {
    it('valida exitosamente una ficha completa de D&D 5e', () => {
      const res = Dnd5eCharacterDataSchema.safeParse(validDndData);
      expect(res.success).toBe(true);
    });

    it('verifica límites numéricos de atributos (1 a 30)', () => {
      // Límites exactos
      const atMin = {
        ...validDndData,
        attributes: { ...validDndData.attributes, strength: 1 },
      };
      expect(Dnd5eCharacterDataSchema.safeParse(atMin).success).toBe(true);

      const atMax = {
        ...validDndData,
        attributes: { ...validDndData.attributes, strength: 30 },
      };
      expect(Dnd5eCharacterDataSchema.safeParse(atMax).success).toBe(true);

      // Fuera de límites
      const belowMin = {
        ...validDndData,
        attributes: { ...validDndData.attributes, strength: 0 },
      };
      expect(Dnd5eCharacterDataSchema.safeParse(belowMin).success).toBe(false);

      const aboveMax = {
        ...validDndData,
        attributes: { ...validDndData.attributes, strength: 31 },
      };
      expect(Dnd5eCharacterDataSchema.safeParse(aboveMax).success).toBe(false);
    });

    it('verifica límites del nivel de personaje (1 a 20)', () => {
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, level: 1 }).success).toBe(true);
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, level: 20 }).success).toBe(true);
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, level: 0 }).success).toBe(false);
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, level: 21 }).success).toBe(
        false,
      );
    });

    it('verifica límites de clase de armadura (0 a 50)', () => {
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, armorClass: 0 }).success).toBe(
        true,
      );
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, armorClass: 50 }).success).toBe(
        true,
      );
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, armorClass: -1 }).success).toBe(
        false,
      );
      expect(Dnd5eCharacterDataSchema.safeParse({ ...validDndData, armorClass: 51 }).success).toBe(
        false,
      );
    });
  });

  describe('Límite estricto de 64 KB en data', () => {
    it('acepta fichas cuyo tamaño JSON es menor o igual a 64 KB', () => {
      const byteLen = getJsonByteLength(validDndData);
      expect(byteLen).toBeLessThanOrEqual(MAX_CHARACTER_DATA_BYTES);
      const res = validateCharacterDataBySystem('dnd5e', validDndData);
      expect(res.success).toBe(true);
    });

    it('rechaza con error si el payload de data supera los 64 KB', () => {
      // Crear un payload que supere 64 KB (65536 bytes)
      const oversizedData = {
        ...validDndData,
        notes: 'A'.repeat(66 * 1024), // ~66 KB
      };
      const byteLen = getJsonByteLength(oversizedData);
      expect(byteLen).toBeGreaterThan(MAX_CHARACTER_DATA_BYTES);

      const res = validateCharacterDataBySystem('dnd5e', oversizedData);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain('64 KB');
      }
    });
  });

  describe('Fichas para otros sistemas de rol (esquema genérico)', () => {
    it('valida una ficha de sistema genérico con pares clave/valor acotados', () => {
      const genericData = {
        description: 'Investigador en La Llamada de Cthulhu',
        stats: {
          Fuerza: 50,
          Constitución: 60,
          Cordura: 75,
          Ocupación: 'Profesor universitario',
        },
        traits: [{ name: 'Fobia a las alturas', value: 'Reacción de pánico leve' }],
        inventory: [{ item: 'Cuaderno de notas', quantity: 2 }],
        notes: 'Encontró un extraño artefacto en Arkham.',
      };

      const res = validateCharacterDataBySystem('cthulhu', genericData);
      expect(res.success).toBe(true);
    });
  });

  describe('CreateCharacterInputSchema & UpdateCharacterInputSchema', () => {
    it('acepta la creación de un personaje D&D 5e válido', () => {
      const input = {
        name: 'Drizzt',
        system: 'dnd5e',
        data: validDndData,
      };
      const res = CreateCharacterInputSchema.safeParse(input);
      expect(res.success).toBe(true);
    });

    it('falla si los datos internos de D&D no cumplen el esquema', () => {
      const badInput = {
        name: 'Drizzt',
        system: 'dnd5e',
        data: {
          ...validDndData,
          level: 25, // Nivel inválido
        },
      };
      const res = CreateCharacterInputSchema.safeParse(badInput);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.includes('data'))).toBe(true);
      }
    });

    it('acepta actualización parcial de personaje', () => {
      const update = {
        name: 'Drizzt Modificado',
        data: {
          ...validDndData,
          level: 6,
        },
      };
      const res = UpdateCharacterInputSchema.safeParse(update);
      expect(res.success).toBe(true);
    });
  });
});
