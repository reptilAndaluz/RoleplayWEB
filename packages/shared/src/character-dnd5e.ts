import { z } from 'zod';

const attributeScore = z
  .number()
  .int({ message: 'El atributo debe ser un número entero' })
  .min(1, { message: 'El atributo no puede ser menor a 1' })
  .max(30, { message: 'El atributo no puede ser mayor a 30' });

export const Dnd5eAttributesSchema = z.object({
  strength: attributeScore,
  dexterity: attributeScore,
  constitution: attributeScore,
  intelligence: attributeScore,
  wisdom: attributeScore,
  charisma: attributeScore,
});

export type Dnd5eAttributes = z.infer<typeof Dnd5eAttributesSchema>;

export const Dnd5eAttackSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bonus: z.number().int().min(-20).max(50),
  damage: z.string().trim().max(50),
  type: z.string().trim().max(50),
  notes: z.string().max(200).optional(),
});

export type Dnd5eAttack = z.infer<typeof Dnd5eAttackSchema>;

export const Dnd5eSpellSlotSchema = z.object({
  current: z.number().int().min(0).max(10),
  max: z.number().int().min(0).max(10),
});

export const Dnd5eSpellSchema = z.object({
  name: z.string().trim().min(1).max(100),
  level: z.number().int().min(0).max(9),
  prepared: z.boolean().default(false),
  school: z.string().trim().max(50).optional(),
  description: z.string().max(1000).optional(),
});

export type Dnd5eSpell = z.infer<typeof Dnd5eSpellSchema>;

export const Dnd5eInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(9999).default(1),
  weight: z.number().min(0).max(10000).default(0),
  notes: z.string().max(200).optional(),
});

export type Dnd5eInventoryItem = z.infer<typeof Dnd5eInventoryItemSchema>;

export const Dnd5eTraitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  source: z.string().trim().max(100).optional(),
  description: z.string().max(2000),
});

export type Dnd5eTrait = z.infer<typeof Dnd5eTraitSchema>;

export const Dnd5eCharacterDataSchema = z.object({
  class: z.string().trim().min(1).max(100),
  level: z
    .number()
    .int({ message: 'El nivel debe ser entero' })
    .min(1, { message: 'El nivel mínimo es 1' })
    .max(20, { message: 'El nivel máximo es 20' }),
  race: z.string().trim().min(1).max(100),
  background: z.string().trim().max(100).default(''),
  alignment: z.string().trim().max(50).default(''),
  experiencePoints: z.number().int().min(0).max(1000000).default(0),

  attributes: Dnd5eAttributesSchema,

  armorClass: z.number().int().min(0).max(50),
  speed: z.number().int().min(0).max(300).default(30),
  initiative: z.number().int().min(-20).max(30).default(0),

  hitPoints: z.object({
    current: z.number().int().min(0).max(1000),
    max: z.number().int().min(1).max(1000),
    temp: z.number().int().min(0).max(1000).default(0),
  }),
  hitDice: z.string().trim().max(20).default('1d8'),
  deathSaves: z
    .object({
      successes: z.number().int().min(0).max(3).default(0),
      failures: z.number().int().min(0).max(3).default(0),
    })
    .default({ successes: 0, failures: 0 }),

  proficiencies: z
    .object({
      proficiencyBonus: z.number().int().min(1).max(10).default(2),
      savingThrows: z.array(z.string().trim().max(30)).max(6).default([]),
      skills: z.array(z.string().trim().max(50)).max(30).default([]),
      passivePerception: z.number().int().min(0).max(40).default(10),
      languages: z.array(z.string().trim().max(50)).max(20).default([]),
      armor: z.array(z.string().trim().max(50)).max(20).default([]),
      weapons: z.array(z.string().trim().max(50)).max(30).default([]),
      tools: z.array(z.string().trim().max(50)).max(30).default([]),
    })
    .default({
      proficiencyBonus: 2,
      savingThrows: [],
      skills: [],
      passivePerception: 10,
      languages: [],
      armor: [],
      weapons: [],
      tools: [],
    }),

  attacks: z.array(Dnd5eAttackSchema).max(30).default([]),

  spells: z
    .object({
      spellcastingAbility: z.string().trim().max(30).optional(),
      spellSaveDc: z.number().int().min(0).max(50).optional(),
      spellAttackBonus: z.number().int().min(-20).max(50).optional(),
      slots: z.record(z.string(), Dnd5eSpellSlotSchema).optional(),
      known: z.array(Dnd5eSpellSchema).max(100).default([]),
    })
    .optional(),

  inventory: z
    .object({
      items: z.array(Dnd5eInventoryItemSchema).max(150).default([]),
      currency: z
        .object({
          cp: z.number().int().min(0).max(1000000).default(0),
          sp: z.number().int().min(0).max(1000000).default(0),
          ep: z.number().int().min(0).max(1000000).default(0),
          gp: z.number().int().min(0).max(1000000).default(0),
          pp: z.number().int().min(0).max(1000000).default(0),
        })
        .default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
    })
    .default({
      items: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    }),

  traits: z.array(Dnd5eTraitSchema).max(60).default([]),
  notes: z.string().max(10000).default(''),
});

export type Dnd5eCharacterData = z.infer<typeof Dnd5eCharacterDataSchema>;
