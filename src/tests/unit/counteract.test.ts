import { describe, it, expect } from 'vitest';
import {
  DEGREE,
  casterSpellDC,
  counteracts,
  effectCounteractDC,
  effectCounteractRank,
  isCounteractSource,
  isSpellEffect,
  levelBasedDC,
  readCounteractCard,
} from '@/counteract/rules';

const spellOrigin = {
  actor: 'Actor.witch',
  uuid: 'Actor.witch.Item.slow',
  type: 'spell',
  castRank: 3,
  rollOptions: ['origin:action:slug:cast-a-spell', 'origin:item:slug:slow'],
};

const spellCast = {
  casting: { id: 'occultEntry', tradition: 'occult' },
  context: { type: 'spell-cast' },
  origin: spellOrigin,
};

const effectCard = {
  origin: {
    actor: 'Actor.fighter',
    uuid: 'Actor.fighter.Item.slowed',
    type: 'effect',
    rollOptions: ['origin:item:slug:spell-effect-slow'],
  },
};

const entries = [
  { id: 'occultEntry', tradition: 'occult', dc: 24 },
  { id: 'primalEntry', tradition: 'primal', dc: 27 },
];

describe('readCounteractCard', () => {
  it('reads the spell, caster, entry and rank of a spell cast', () => {
    expect(readCounteractCard(spellCast)).toEqual({
      kind: 'spell',
      originUuid: 'Actor.witch.Item.slow',
      actorUuid: 'Actor.witch',
      entryId: 'occultEntry',
      castRank: 3,
    });
  });

  it('reads a cast of a spell without a defense', () => {
    expect(readCounteractCard({ ...spellCast, context: undefined })?.kind).toBe('spell');
  });

  it('reads the effect and the actor holding it from an effect card', () => {
    expect(readCounteractCard(effectCard)).toEqual({
      kind: 'effect',
      originUuid: 'Actor.fighter.Item.slowed',
      actorUuid: 'Actor.fighter',
    });
  });

  it('rejects a spell card without a casting entry', () => {
    expect(readCounteractCard({ ...spellCast, casting: null })).toBeNull();
  });

  it('rejects a spell card posted from the sheet without a cast', () => {
    const origin = { ...spellOrigin, rollOptions: ['origin:item:slug:slow'] };
    expect(readCounteractCard({ ...spellCast, origin })).toBeNull();
  });

  it.each(['damage-roll', 'spell-attack-roll', 'saving-throw'])('rejects a %s from a spell', (type) => {
    expect(readCounteractCard({ context: { type }, origin: spellOrigin })).toBeNull();
  });

  it('rejects a damage roll from an effect', () => {
    expect(readCounteractCard({ ...effectCard, context: { type: 'damage-roll' } })).toBeNull();
  });

  it.each(['condition', 'equipment', 'feat'])('rejects a %s card', (type) => {
    expect(readCounteractCard({ origin: { ...effectCard.origin, type } })).toBeNull();
  });

  it('rejects an effect card for an effect no actor holds', () => {
    const origin = { uuid: 'Compendium.pf2e.spell-effects.Item.slowed', type: 'effect' };
    expect(readCounteractCard({ origin })).toBeNull();
  });

  it('rejects a message without pf2e flags', () => {
    expect(readCounteractCard({})).toBeNull();
    expect(readCounteractCard()).toBeNull();
  });
});

describe('spell card target', () => {
  const card = readCounteractCard(spellCast)!;

  it('counteracts at the cast rank', () => {
    expect(card.castRank).toBe(3);
  });

  it('uses the DC of the entry that cast it', () => {
    expect(casterSpellDC(entries, { id: card.entryId })).toBe(24);
  });

  it('prefers the casting entry over a higher DC of the same tradition', () => {
    const twoOccult = [...entries, { id: 'focusEntry', tradition: 'occult', dc: 26 }];
    expect(casterSpellDC(twoOccult, { id: card.entryId, tradition: 'occult' })).toBe(24);
  });

  it("falls back to the caster's highest spell DC when that entry is gone", () => {
    expect(casterSpellDC(entries, { id: 'scrollEntry' })).toBe(27);
  });

  it('has no DC for a caster without spellcasting', () => {
    expect(casterSpellDC([], { id: card.entryId })).toBeNull();
  });
});

describe('effect from a spell', () => {
  it('is recognised by its spellcasting origin', () => {
    expect(isSpellEffect({ spellcasting: { tradition: 'occult' }, originItemType: null })).toBe(true);
  });

  it('is recognised by a spell origin item', () => {
    expect(isSpellEffect({ spellcasting: null, originItemType: 'spell' })).toBe(true);
  });

  it.each([
    ['a feat origin', { spellcasting: null, originItemType: 'feat' }],
    ['no origin', {}],
  ])('is not recognised from %s', (_reason, origin) => {
    expect(isSpellEffect(origin)).toBe(false);
  });

  it.each([1, 4, 10])('counteracts at its level %i', (level) => {
    expect(effectCounteractRank({ level, fromSpell: true })).toBe(level);
  });

  it("uses the origin actor's DC for the effect's tradition", () => {
    const casterDC = casterSpellDC(entries, { tradition: 'occult' });
    expect(effectCounteractDC({ level: 3, fromSpell: true, casterDC })).toBe(24);
  });

  it('uses the highest DC of several entries of that tradition', () => {
    const twoOccult = [...entries, { id: 'focusEntry', tradition: 'occult', dc: 25 }];
    expect(casterSpellDC(twoOccult, { tradition: 'occult' })).toBe(25);
  });

  it.each([
    ['is unknown', null],
    ['matches no entry', 'divine'],
  ])("uses the origin actor's highest DC when the tradition %s", (_reason, tradition) => {
    expect(casterSpellDC(entries, { tradition })).toBe(27);
  });

  it('uses the level-based DC without an origin caster DC', () => {
    expect(effectCounteractDC({ level: 4, fromSpell: true, casterDC: null })).toBe(19);
  });
});

describe('other effect', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [5, 3],
    [20, 10],
    [-1, 0],
  ])('at level %i counteracts at rank %i', (level, rank) => {
    expect(effectCounteractRank({ level, fromSpell: false })).toBe(rank);
  });

  it("uses the level-based DC even when the origin actor casts spells", () => {
    expect(effectCounteractDC({ level: 5, fromSpell: false, casterDC: 27 })).toBe(20);
  });
});

describe('levelBasedDC', () => {
  it.each([
    [-1, 13],
    [0, 14],
    [1, 15],
    [3, 18],
    [20, 40],
    [21, 42],
    [25, 50],
  ])('is %i → %i', (level, dc) => {
    expect(levelBasedDC(level)).toBe(dc);
  });

  it.each([
    [-3, 13],
    [30, 50],
  ])('clamps level %i to the end of the table', (level, dc) => {
    expect(levelBasedDC(level)).toBe(dc);
  });
});

describe('counteracts', () => {
  it.each([
    ['critical success', DEGREE.criticalSuccess, 7, true],
    ['critical success', DEGREE.criticalSuccess, 8, false],
    ['success', DEGREE.success, 5, true],
    ['success', DEGREE.success, 6, false],
    ['failure', DEGREE.failure, 3, true],
    ['failure', DEGREE.failure, 4, false],
    ['critical failure', DEGREE.criticalFailure, 1, false],
  ] as const)('a %s from rank 4 against rank %i counteracts: %s', (_name, degree, targetRank, result) => {
    expect(counteracts(degree, 4, targetRank)).toBe(result);
  });
});

describe('isCounteractSource', () => {
  it.each([
    '<p>Attempt to counteract the target.</p>',
    '<p>Make a <strong>Counteract</strong> check.</p>',
    'Each spell it counteracts ends.',
    '@UUID[Compendium.pf2e.journals.JournalEntry.rules]{Counteracting}',
  ])('accepts %s', (description) => {
    expect(isCounteractSource({ counteraction: false, description })).toBe(true);
  });

  it('accepts a spell PF2e flags as counteracting whatever its description says', () => {
    expect(isCounteractSource({ counteraction: true, description: '<p>The target is freed.</p>' })).toBe(true);
  });

  it.each([
    '<p>Deal 2d6 fire damage.</p>',
    '<span data-slug="counteract">Dispel</span>',
    '',
    null,
    undefined,
  ])('rejects %s', (description) => {
    expect(isCounteractSource({ counteraction: false, description })).toBe(false);
  });

  it('rejects a spell with neither the flag nor a description', () => {
    expect(isCounteractSource({})).toBe(false);
  });
});
