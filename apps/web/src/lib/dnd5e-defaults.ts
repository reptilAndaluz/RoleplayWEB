import type { Dnd5eCharacterData } from '@rol/shared';

export function createDefaultDnd5eData(): Dnd5eCharacterData {
  return {
    class: 'Guerrero',
    level: 1,
    race: 'Humano',
    background: 'Soldado',
    alignment: 'Neutral Bueno',
    experiencePoints: 0,
    attributes: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    armorClass: 10,
    speed: 30,
    initiative: 0,
    hitPoints: {
      current: 10,
      max: 10,
      temp: 0,
    },
    hitDice: '1d10',
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    proficiencies: {
      proficiencyBonus: 2,
      savingThrows: ['strength', 'constitution'],
      skills: ['Atletismo', 'Percepción'],
      passivePerception: 10,
      languages: ['Común'],
      armor: ['Todas las armaduras', 'Escudos'],
      weapons: ['Armas simples', 'Armas marciales'],
      tools: [],
    },
    attacks: [
      {
        name: 'Espada Larga',
        bonus: 2,
        damage: '1d8+0',
        type: 'Cortante',
        notes: 'Versátil (1d10)',
      },
    ],
    spells: {
      spellcastingAbility: 'intelligence',
      spellSaveDc: 10,
      spellAttackBonus: 2,
      slots: {
        '1': { current: 0, max: 0 },
        '2': { current: 0, max: 0 },
        '3': { current: 0, max: 0 },
        '4': { current: 0, max: 0 },
        '5': { current: 0, max: 0 },
        '6': { current: 0, max: 0 },
        '7': { current: 0, max: 0 },
        '8': { current: 0, max: 0 },
        '9': { current: 0, max: 0 },
      },
      known: [],
    },
    inventory: {
      items: [
        {
          name: 'Mochila de aventurero',
          quantity: 1,
          weight: 5,
          notes: 'Incluye saco de dormir y raciones',
        },
      ],
      currency: {
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 15,
        pp: 0,
      },
    },
    traits: [
      {
        name: 'Segundo Aliento',
        source: 'Guerrero Nvl 1',
        description: 'Una vez por descanso corto o largo, puedes usar una acción adicional para recuperar 1d10 + nivel PG.',
      },
    ],
    notes: 'Notas de campaña y trasfondo del personaje.',
  };
}
