import { describe, it, expect } from 'vitest';
import {
  DEGREE,
  applyControl,
  asDegree,
  casterSpellDC,
  counteracts,
  degreeNeeded,
  effectCounteractDC,
  effectCounteractRank,
  hazardCounteract,
  isCounteractSource,
  isEffectLevelClear,
  isSpellEffect,
  levelBasedDC,
  matchesSpell,
  needsPicker,
  readCounteractCard,
  readCounteractFlag,
  rerolledFlag,
  restorePlan,
  skillCounteractRank,
  stageStep,
  storedCounteractTarget,
  undoRecord,
  type CounteractFlag,
  type UndoEntry,
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

describe('readCounteractCard from a hazard', () => {
  const hazard = { uuid: 'Scene.vault.Token.trap.Actor.frozen', type: 'hazard' };

  it.each([
    ['an action card', {}],
    ['a damage roll', { context: { type: 'damage-roll' }, origin: { actor: hazard.uuid, uuid: 'x', type: 'action' } }],
  ])('reads %s a hazard speaks as counteracting the hazard', (_name, flags) => {
    expect(readCounteractCard(flags, hazard)).toEqual({
      kind: 'hazard',
      originUuid: hazard.uuid,
      actorUuid: hazard.uuid,
    });
  });

  it('prefers the spell a hazard casts', () => {
    expect(readCounteractCard(spellCast, hazard)?.kind).toBe('spell');
  });

  it('prefers the effect a hazard posts', () => {
    expect(readCounteractCard(effectCard, hazard)?.kind).toBe('effect');
  });

  it('rejects a damage roll a creature speaks', () => {
    const npc = { uuid: 'Actor.ogre', type: 'npc' };
    expect(readCounteractCard({ context: { type: 'damage-roll' } }, npc)).toBeNull();
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

describe('effect with an unclear level, from a creature', () => {
  it.each([
    [7, 4],
    [8, 4],
    [0, 0],
    [-1, 0],
  ])('from a level %i creature counteracts at rank %i', (creatureLevel, rank) => {
    expect(effectCounteractRank({ level: null, fromSpell: false, creatureLevel })).toBe(rank);
  });

  it("uses the level-based DC for the creature's level", () => {
    expect(effectCounteractDC({ level: null, fromSpell: false, creatureLevel: 7 })).toBe(23);
  });

  it('has no rank or DC without a creature', () => {
    expect(effectCounteractRank({ level: null, fromSpell: false })).toBeNull();
    expect(effectCounteractDC({ level: null, fromSpell: false, creatureLevel: null })).toBeNull();
  });

  it('ignores the creature when the effect has a level', () => {
    expect(effectCounteractRank({ level: 5, fromSpell: false, creatureLevel: 12 })).toBe(3);
    expect(effectCounteractDC({ level: 5, fromSpell: false, creatureLevel: 12 })).toBe(20);
  });
});

describe('isEffectLevelClear', () => {
  it.each([
    ['a level above PF2e default', { level: 4, fromSpell: false, originItemType: 'action' }],
    ['a level-1 spell effect', { level: 1, fromSpell: true, originItemType: 'spell' }],
    ['a level-1 effect from a consumable', { level: 1, fromSpell: false, originItemType: 'consumable' }],
    ['a level-0 effect', { level: 0, fromSpell: false, originItemType: null }],
  ])('trusts %s', (_name, effect) => {
    expect(isEffectLevelClear(effect)).toBe(true);
  });

  it.each([
    ['a creature ability', 'action'],
    ['a feat', 'feat'],
    ['no origin item', null],
  ])('doubts a level-1 effect from %s', (_name, originItemType) => {
    expect(isEffectLevelClear({ level: 1, fromSpell: false, originItemType })).toBe(false);
  });
});

describe('skillCounteractRank', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1, 1],
    [7, 4],
    [20, 10],
  ])('at roller level %i is rank %i', (level, rank) => {
    expect(skillCounteractRank(level)).toBe(rank);
  });
});

describe('hazardCounteract', () => {
  const frozenMoment =
    '<p>@Check[thievery|dc:38|name:Disassemble Spell Components|traits:action:disable-a-device] (legendary) to ' +
    "rapidly disassemble the spell's myriad components in a single blink of an eye; or " +
    '@UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (9th rank; counteract DC 36) to counteract the trap ' +
    'before it triggers or to counteract the effect on one creature after the trap is triggered</p>';
  const pharaohsWard =
    '<p>@Check[thievery|dc:27|name:Remove the Lintel] (master) to painstakingly remove the lintel without ' +
    'triggering the magic, or @UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (4th rank; counteract DC 25) ' +
    'to counteract the rune</p>';

  it("reads Frozen Moment's rank and DC from its Disable text", () => {
    expect(hazardCounteract({ disable: frozenMoment, level: 17 })).toEqual({
      rank: 9,
      dc: 36,
      rankFromText: true,
      dcFromText: true,
    });
  });

  it("reads Pharaoh's Ward's DC 25 over the level-based 23", () => {
    expect(hazardCounteract({ disable: pharaohsWard, level: 7 })).toEqual({
      rank: 4,
      dc: 25,
      rankFromText: true,
      dcFromText: true,
    });
  });

  it('falls back to half the level and the level-based DC without numbers', () => {
    const disable = '<p>@Check[thievery|dc:30] (expert) to jam the mechanism</p>';
    expect(hazardCounteract({ disable, level: 9 })).toEqual({
      rank: 5,
      dc: 26,
      rankFromText: false,
      dcFromText: false,
    });
  });

  it("does not read a Check's DC as the counteract DC", () => {
    const disable = '<p>@Check[thievery|dc:38] (legendary) to disassemble, or counteract DC @Check[arcana|dc:40]</p>';
    expect(hazardCounteract({ disable, level: 17 })).toMatchObject({ dc: 36, dcFromText: false });
  });

  it.each([
    ['5th-level dispel magic', 5],
    ['a rank 6 spell', 6],
    ['7th level; counteraction DC 31', 7],
  ])('reads the rank in "%s"', (disable, rank) => {
    expect(hazardCounteract({ disable, level: 1 })).toMatchObject({ rank, rankFromText: true });
  });

  it('reads "counteraction DC"', () => {
    expect(hazardCounteract({ disable: '7th level; counteraction DC 31', level: 1 }).dc).toBe(31);
  });

  it('falls back to rank 0 for a level-0 hazard without text', () => {
    expect(hazardCounteract({ disable: '', level: 0 })).toEqual({
      rank: 0,
      dc: 14,
      rankFromText: false,
      dcFromText: false,
    });
  });
});

describe('storedCounteractTarget', () => {
  it("reads a posted hazard card's rank and DC", () => {
    expect(storedCounteractTarget({ rank: 9, dc: 36 })).toEqual({ rank: 9, dc: 36 });
  });

  it.each([
    ['no flag', undefined],
    ['a missing DC', { rank: 9 }],
    ['a text rank', { rank: '9', dc: 36 }],
    ['a fractional DC', { rank: 9, dc: 36.5 }],
  ])('ignores %s', (_name, flag) => {
    expect(storedCounteractTarget(flag)).toBeNull();
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

describe('degreeNeeded', () => {
  it.each([
    ['a failure', 3, DEGREE.failure],
    ['a success', 4, DEGREE.success],
    ['a success', 5, DEGREE.success],
    ['a critical success', 6, DEGREE.criticalSuccess],
    ['a critical success', 7, DEGREE.criticalSuccess],
  ] as const)('from rank 4 is %s against rank %i', (_name, targetRank, degree) => {
    expect(degreeNeeded(4, targetRank)).toBe(degree);
  });

  it('is nothing when even a critical success falls short', () => {
    expect(degreeNeeded(4, 8)).toBeNull();
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

const rolledFlag: CounteractFlag = {
  card: 'slowCard',
  kind: 'spell',
  originUuid: 'Actor.witch.Item.slow',
  source: { kind: 'skill', name: 'Arcana', slug: 'arcana' },
  targetRank: 3,
  sourceRank: 3,
  dc: 24,
  degree: DEGREE.success,
  counteracted: true,
  targets: ['Scene.s.Token.goblin'],
  applied: false,
  undo: [],
};

describe('readCounteractFlag', () => {
  it('reads a roll flag written before Apply existed as unapplied', () => {
    const { applied: _applied, undo: _undo, ...wave2 } = rolledFlag;
    expect(readCounteractFlag(wave2)).toEqual(rolledFlag);
  });

  it('keeps the applied state and undo record', () => {
    const undo: UndoEntry[] = [{ actorUuid: 'Actor.goblin', effectId: 'slowed', previousStage: 2 }];
    expect(readCounteractFlag({ ...rolledFlag, applied: true, undo })).toMatchObject({ applied: true, undo });
  });

  it('reads an unknown degree as none', () => {
    expect(readCounteractFlag({ ...rolledFlag, degree: 7 })?.degree).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['a stored hazard target', { rank: 9, dc: 36 }],
    ['an unknown card kind', { ...rolledFlag, kind: 'condition' }],
    ['a fractional rank', { ...rolledFlag, targetRank: 2.5 }],
    ['missing targets', { ...rolledFlag, targets: undefined }],
  ])('rejects %s', (_name, raw) => {
    expect(readCounteractFlag(raw)).toBeNull();
  });
});

describe('asDegree', () => {
  it.each([0, 1, 2, 3])('accepts %i', (degree) => {
    expect(asDegree(degree)).toBe(degree);
  });

  it.each([-1, 4, 1.5, '2', null, undefined])('rejects %s', (value) => {
    expect(asDegree(value)).toBeNull();
  });
});

describe('applyControl', () => {
  it('offers Apply to a GM on a counteracting roll', () => {
    expect(applyControl(rolledFlag, true)).toBe('apply');
  });

  it('offers Undo once applied', () => {
    expect(applyControl({ ...rolledFlag, applied: true }, true)).toBe('undo');
  });

  it('offers Undo on an applied roll a reroll turned into a failure', () => {
    expect(applyControl({ ...rolledFlag, counteracted: false, applied: true }, true)).toBe('undo');
  });

  it('offers nothing on a roll that failed to counteract', () => {
    expect(applyControl({ ...rolledFlag, counteracted: false }, true)).toBeNull();
  });

  it.each([
    ['unapplied', false],
    ['applied', true],
  ])('offers a player nothing on an %s roll', (_name, applied) => {
    expect(applyControl({ ...rolledFlag, applied }, false)).toBeNull();
  });

  it('offers nothing on a message without the flag', () => {
    expect(applyControl(null, true)).toBeNull();
  });
});

describe('rerolledFlag', () => {
  it('recounts the result from the new degree', () => {
    expect(rerolledFlag(rolledFlag, DEGREE.failure)).toMatchObject({ degree: DEGREE.failure, counteracted: false });
  });

  it('turns a failure into a counteract when the reroll succeeds', () => {
    const failed = { ...rolledFlag, degree: DEGREE.failure, counteracted: false };
    expect(rerolledFlag(failed, DEGREE.success)).toMatchObject({ degree: DEGREE.success, counteracted: true });
  });

  it('keeps the card, ranks, DC, targets and applied state', () => {
    const undo: UndoEntry[] = [{ actorUuid: 'Actor.goblin', effectId: 'slowed', previousStage: 2 }];
    const applied = { ...rolledFlag, applied: true, undo };
    expect(rerolledFlag(applied, DEGREE.criticalFailure)).toEqual({
      ...applied,
      degree: DEGREE.criticalFailure,
      counteracted: false,
    });
  });

  it('counts a reroll with no degree as no counteract', () => {
    expect(rerolledFlag(rolledFlag, null).counteracted).toBe(false);
  });
});

describe('matchesSpell', () => {
  it('matches an effect whose origin item is the spell', () => {
    expect(matchesSpell({ originItem: 'Actor.witch.Item.slow' }, 'Actor.witch.Item.slow')).toBe(true);
  });

  it.each([
    ['another spell', 'Actor.witch.Item.haste'],
    ['the same spell on another caster', 'Actor.wizard.Item.slow'],
    ['no origin item', null],
    ['no context', undefined],
  ])('rejects an effect from %s', (_name, originItem) => {
    expect(matchesSpell({ originItem }, 'Actor.witch.Item.slow')).toBe(false);
  });

  it('never matches a blank spell uuid', () => {
    expect(matchesSpell({ originItem: '' }, '')).toBe(false);
  });
});

describe('needsPicker', () => {
  it.each([
    [0, true],
    [1, false],
    [2, true],
  ])('with %i matches is %s', (matches, result) => {
    expect(needsPicker(matches)).toBe(result);
  });
});

describe('stageStep', () => {
  it('lowers a counter badge one stage', () => {
    expect(stageStep({ type: 'counter', value: 3, min: 1 })).toEqual({ type: 'lower', from: 3, to: 2 });
  });

  it('ends a counter badge at stage 1', () => {
    expect(stageStep({ type: 'counter', value: 1, min: 1 })).toEqual({ type: 'remove' });
  });

  it('ends a counter badge at stage 1 even when its minimum is 0', () => {
    expect(stageStep({ type: 'counter', value: 1, min: 0 })).toEqual({ type: 'remove' });
  });

  it('ends a counter badge at a minimum above 1', () => {
    expect(stageStep({ type: 'counter', value: 2, min: 2 })).toEqual({ type: 'remove' });
  });

  it('reads a missing minimum as 1', () => {
    expect(stageStep({ type: 'counter', value: 2 })).toEqual({ type: 'lower', from: 2, to: 1 });
  });

  it('ends an expired counter outright, as PF2e does', () => {
    expect(stageStep({ type: 'counter', value: 3, min: 1 }, true)).toEqual({ type: 'remove' });
  });

  it.each([
    ['no badge', null],
    ['a value badge', { type: 'value', value: 4 }],
    ['a formula badge', { type: 'formula', value: '1d4' }],
  ])('ends an effect with %s', (_name, badge) => {
    expect(stageStep(badge)).toEqual({ type: 'remove' });
  });
});

describe('undoRecord', () => {
  const slowed = { name: 'Slowed' };
  const sickened = { name: 'Sickened' };

  it('records a removed effect with its source', () => {
    const ended = [{ id: 'slowed', step: { type: 'remove' as const }, data: slowed }];
    expect(undoRecord('Actor.goblin', ended, new Set())).toEqual([
      { actorUuid: 'Actor.goblin', effectId: 'slowed', data: slowed },
    ]);
  });

  it('records a lowered effect with the stage it left', () => {
    const ended = [{ id: 'poison', step: { type: 'lower' as const, from: 3, to: 2 }, data: sickened }];
    expect(undoRecord('Actor.goblin', ended, new Set(['poison']))).toEqual([
      { actorUuid: 'Actor.goblin', effectId: 'poison', previousStage: 3 },
    ]);
  });

  it('leaves out an effect PF2e refused to delete', () => {
    const ended = [
      { id: 'slowed', step: { type: 'remove' as const }, data: slowed },
      { id: 'granted', step: { type: 'remove' as const }, data: sickened },
    ];
    expect(undoRecord('Actor.goblin', ended, new Set(['granted'])).map((entry) => entry.effectId)).toEqual([
      'slowed',
    ]);
  });
});

describe('restorePlan', () => {
  const slowed = { name: 'Slowed' };
  const undo: UndoEntry<typeof slowed>[] = [
    { actorUuid: 'Actor.goblin', effectId: 'slowed', data: slowed },
    { actorUuid: 'Actor.goblin', effectId: 'poison', previousStage: 3 },
    { actorUuid: 'Actor.orc', effectId: 'slowed', data: slowed },
  ];
  const held = (entries: string[]) => (actorUuid: string, effectId: string) =>
    entries.includes(`${actorUuid}.${effectId}`);

  it('groups the writes by actor', () => {
    expect(restorePlan(undo, held(['Actor.goblin.poison']))).toEqual({
      groups: [
        {
          actorUuid: 'Actor.goblin',
          create: [{ effectId: 'slowed', data: slowed }],
          reset: [{ effectId: 'poison', stage: 3 }],
        },
        { actorUuid: 'Actor.orc', create: [{ effectId: 'slowed', data: slowed }], reset: [] },
      ],
      skipped: [],
    });
  });

  it('skips an effect already back under its id', () => {
    const { groups, skipped } = restorePlan(undo, held(['Actor.goblin.poison', 'Actor.orc.slowed']));
    expect(groups.map((group) => group.actorUuid)).toEqual(['Actor.goblin']);
    expect(skipped).toEqual([undo[2]]);
  });

  it('skips a lowered effect that has since gone', () => {
    const { groups, skipped } = restorePlan(undo, held([]));
    expect(groups[0].reset).toEqual([]);
    expect(skipped).toEqual([undo[1]]);
  });
});
