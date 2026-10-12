import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AMPED_TAG,
  GLIMPSE_SPELL,
  PRECISION_SLUG,
  TARGET_EFFECT,
  TARGET_EFFECT_SLUG,
  isAmped,
  precisionDamage,
  readCast,
  spendsGlimpse,
} from '@/glimpse/rules';

interface Rule {
  key: string;
  slug?: string;
  uuid?: string;
  predicate?: unknown[];
  alterations?: { property: string; value: string }[];
}

interface EffectSource {
  _id: string;
  _key: string;
  system: { slug: string; description: { value: string }; badge?: { type: string }; rules: Rule[] };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8')) as T;
}

const EFFECTS = 'packs/_source/_library/effects';
const target = readJson<EffectSource>(`${EFFECTS}/spell-effect-glimpse-weakness-target.json`);
const attacker = readJson<EffectSource>(`${EFFECTS}/spell-effect-glimpse-weakness-attacker.json`);
const lang = readJson<{ 'marks-mods': { glimpse: Record<string, Record<string, string>> } }>('lang/en.json');
const manifest = readJson<{ id: string; packs: { name: string; type: string; system?: string }[] }>('module.json');

const cast = {
  casting: { id: 'entry' },
  origin: {
    actor: 'Actor.caster',
    uuid: 'Actor.caster.Item.spell',
    castRank: 3,
    rollOptions: ['origin:action:slug:cast-a-spell', 'origin:item:slug:glimpse-weakness', 'origin:item:tag:amped'],
  },
};

describe('readCast', () => {
  it('reads the caster, spell, rank and roll options of a Glimpse Weakness cast', () => {
    expect(readCast(cast)).toEqual({
      caster: 'Actor.caster',
      spell: 'Actor.caster.Item.spell',
      rank: 3,
      rollOptions: cast.origin.rollOptions,
    });
  });

  it('rejects another spell', () => {
    const rollOptions = ['origin:action:slug:cast-a-spell', 'origin:item:slug:force-barrage'];
    expect(readCast({ ...cast, origin: { ...cast.origin, rollOptions } })).toBeNull();
  });

  it('rejects the spell card posted without a cast', () => {
    const rollOptions = ['origin:item:slug:glimpse-weakness'];
    expect(readCast({ origin: { ...cast.origin, rollOptions } })).toBeNull();
  });

  it('rejects a message without an origin', () => {
    expect(readCast({})).toBeNull();
  });
});

describe('isAmped', () => {
  const amped = readCast(cast)!;
  const plain = { ...amped, rollOptions: amped.rollOptions.filter((option) => option !== 'origin:item:tag:amped') };

  it('accepts a cast that carries the amped tag', () => {
    expect(isAmped(amped, { 'amp-spell': true })).toBe(true);
  });

  it('rejects a cast without the tag', () => {
    expect(isAmped(plain, {})).toBe(false);
  });

  it("rejects a cast amped with a feat's alternate amp", () => {
    expect(isAmped(amped, { 'amp-spell': true, 'alternate-amp': true, 'alternate-amp:warp-space': true })).toBe(false);
  });

  it('reads the tag alone when the caster is unknown', () => {
    expect(isAmped(amped)).toBe(true);
  });
});

describe('precisionDamage', () => {
  it.each([
    [1, '2'],
    [8, '9'],
    [10, '11'],
  ])('is 1 + rank for an unamped cast at rank %i', (rank, damage) => {
    expect(precisionDamage(rank, false)).toBe(damage);
  });

  it.each([
    [1, '1d4+1'],
    [2, '1d4+1'],
    [3, '2d4+2'],
    [7, '4d4+4'],
    [8, '4d4+4'],
    [9, '5d4+5'],
  ])('adds 1d4+1 every 2 ranks for an amped cast at rank %i', (rank, damage) => {
    expect(precisionDamage(rank, true)).toBe(damage);
  });
});

describe('spendsGlimpse', () => {
  const precision = { slug: PRECISION_SLUG, enabled: true, ignored: false };

  it('accepts a damage roll that includes the precision damage', () => {
    expect(spendsGlimpse({ context: { type: 'damage-roll' }, modifiers: [precision] })).toBe(true);
  });

  it.each([
    ['is switched off in the damage dialog', { ...precision, enabled: false }],
    ['fails its predicate', { ...precision, ignored: true }],
    ['belongs to another effect', { ...precision, slug: 'sneak-attack' }],
  ])('rejects a damage roll whose modifier %s', (_reason, modifier) => {
    expect(spendsGlimpse({ context: { type: 'damage-roll' }, modifiers: [modifier] })).toBe(false);
  });

  it('rejects an attack roll', () => {
    expect(spendsGlimpse({ context: { type: 'attack-roll' }, modifiers: [precision] })).toBe(false);
  });

  it('rejects a message without pf2e context', () => {
    expect(spendsGlimpse({})).toBe(false);
  });
});

describe('effects pack', () => {
  it('is registered as a pf2e Item pack', () => {
    expect(manifest.packs).toContainEqual(expect.objectContaining({ name: 'effects', type: 'Item', system: 'pf2e' }));
  });

  it.each([
    ['target', target],
    ['attacker', attacker],
  ])('keys the %s effect by its id', (_name, effect) => {
    expect(effect._id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(effect._key).toBe(`!items!${effect._id}`);
  });

  it('links the spell by its compendium id', () => {
    expect(target.system.description.value).toContain(`@UUID[${GLIMPSE_SPELL}]`);
  });

  it('has the strings the script localizes', () => {
    const { effect, warn } = lang['marks-mods'].glimpse;
    expect(Object.keys(effect).sort()).toEqual(['amped', 'damage', 'granted', 'unamped']);
    expect(Object.keys(warn).sort()).toEqual(['noEffect', 'noTarget']);
  });

  it('holds the target effect the script applies', () => {
    expect(TARGET_EFFECT).toBe(`Compendium.${manifest.id}.effects.Item.${target._id}`);
    expect(target.system.slug).toBe(TARGET_EFFECT_SLUG);
  });

  it('links every ephemeral rule on the target effect to the attacker effect', () => {
    const links = target.system.rules.filter((rule) => rule.key === 'EphemeralEffect').map((rule) => rule.uuid);
    expect(links).toHaveLength(2);
    expect(new Set(links)).toEqual(new Set([`Compendium.${manifest.id}.effects.Item.${attacker._id}`]));
  });

  it('picks the damage by the tag the script sets on an amped cast', () => {
    const [plain, amped] = target.system.rules.filter((rule) => rule.key === 'EphemeralEffect');
    const tag = `parent:tag:${AMPED_TAG}`;
    expect(plain.predicate).toEqual([{ not: tag }]);
    expect(plain.alterations).toEqual([expect.objectContaining({ property: 'badge-value', value: '1 + @item.level' })]);
    expect(amped.predicate).toEqual([tag]);
    expect(amped.alterations).toEqual([
      expect.objectContaining({ property: 'badge-value', value: 'ceil(@item.level / 2)' }),
      expect.objectContaining({ property: 'other-tags', value: AMPED_TAG }),
    ]);
  });

  it('rolls the d4s only on the amped copy of the attacker effect', () => {
    const dice = attacker.system.rules.find((rule) => rule.key === 'DamageDice');
    expect(dice?.predicate).toEqual([`parent:tag:${AMPED_TAG}`]);
  });

  it('gives the attacker effect the counter and the modifier slug the script watches for', () => {
    expect(attacker.system.badge?.type).toBe('counter');
    const modifier = attacker.system.rules.find((rule) => rule.key === 'FlatModifier');
    expect(modifier?.slug).toBe(PRECISION_SLUG);
  });
});
