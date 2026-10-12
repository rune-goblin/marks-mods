import { MODULE_ID } from '@/constants';

export const TARGET_EFFECT = `Compendium.${MODULE_ID}.effects.Item.mmGlimpseTarget0`;
export const TARGET_EFFECT_SLUG = 'spell-effect-glimpse-weakness-target';
export const PRECISION_SLUG = 'glimpse-weakness';
export const AMPED_TAG = 'amped';
export const GLIMPSE_SPELL = 'Compendium.pf2e.spells-srd.Item.cNnHV97gPqxJ3Rrr';

const CAST_A_SPELL = 'origin:action:slug:cast-a-spell';
const GLIMPSE_WEAKNESS = 'origin:item:slug:glimpse-weakness';
const AMPED = `origin:item:tag:${AMPED_TAG}`;
const ALTERNATE_AMP = 'alternate-amp';

export interface GlimpseCast {
  caster: string;
  spell: string;
  rank: number;
  rollOptions: string[];
}

interface CastFlags {
  casting?: object | null;
  origin?: { actor?: string; uuid: string; castRank?: number; rollOptions?: string[] } | null;
}

interface DamageFlags {
  context?: { type: string };
  modifiers?: { slug?: string; enabled?: boolean; ignored?: boolean }[];
}

export function readCast({ casting, origin }: CastFlags): GlimpseCast | null {
  const rollOptions = origin?.rollOptions ?? [];
  if (!casting || !origin?.actor) return null;
  if (!rollOptions.includes(CAST_A_SPELL) || !rollOptions.includes(GLIMPSE_WEAKNESS)) return null;
  return { caster: origin.actor, spell: origin.uuid, rank: origin.castRank ?? 1, rollOptions };
}

/** A feat's alternate amp replaces the spell's own, so that cast keeps the unamped damage. */
export function isAmped(cast: GlimpseCast, casterOptions: Record<string, boolean | undefined> = {}): boolean {
  return cast.rollOptions.includes(AMPED) && !casterOptions[ALTERNATE_AMP];
}

// Mirrors the badge formulas in the target effect's rules, so the tooltip states what they roll.
export function precisionDamage(rank: number, amped: boolean): string {
  if (!amped) return String(1 + rank);
  const steps = Math.ceil(rank / 2);
  return `${steps}d4+${steps}`;
}

export function spendsGlimpse({ context, modifiers }: DamageFlags): boolean {
  if (context?.type !== 'damage-roll') return false;
  return (modifiers ?? []).some(
    (modifier) => modifier.slug === PRECISION_SLUG && modifier.enabled && !modifier.ignored,
  );
}
