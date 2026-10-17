const CAST_A_SPELL = 'origin:action:slug:cast-a-spell';

// Copied from PF2e's `dcByLevel` (src/module/dc.ts), the GM Core table.
const LEVEL_DCS = [13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const MIN_LEVEL = -1;
const MAX_LEVEL = 25;
const DEFAULT_EFFECT_LEVEL = 1;
// PF2e's PHYSICAL_ITEM_TYPES (src/module/item/physical/values.ts).
const PHYSICAL_ITEM_TYPES = new Set([
  'ammo',
  'armor',
  'backpack',
  'book',
  'consumable',
  'equipment',
  'shield',
  'treasure',
  'weapon',
]);

export const DEGREE = { criticalFailure: 0, failure: 1, success: 2, criticalSuccess: 3 } as const;
export type Degree = (typeof DEGREE)[keyof typeof DEGREE];

export type CounteractCard =
  | { kind: 'spell'; originUuid: string; actorUuid: string; entryId: string; castRank: number }
  | { kind: 'effect'; originUuid: string; actorUuid: string; entryId?: undefined; castRank?: undefined }
  | { kind: 'hazard'; originUuid: string; actorUuid: string; entryId?: undefined; castRank?: undefined };

/** The actor a message speaks for, by uuid and actor type. */
export interface CardSpeaker {
  uuid: string;
  type: string;
}

export interface SpellcastingDC {
  id: string;
  tradition: string | null;
  dc: number;
}

interface CardFlags {
  context?: { type?: string } | null;
  casting?: { id: string } | null;
  origin?: { actor?: string; uuid?: string; type?: string; castRank?: number; rollOptions?: string[] } | null;
}

/** A spell cast or effect card wins; failing that, any card a hazard speaks counteracts the hazard. */
export function readCounteractCard(flags: CardFlags = {}, speaker?: CardSpeaker | null): CounteractCard | null {
  const card = readItemCard(flags);
  if (card || speaker?.type !== 'hazard') return card;
  return { kind: 'hazard', originUuid: speaker.uuid, actorUuid: speaker.uuid };
}

function readItemCard({ context, casting, origin }: CardFlags): CounteractCard | null {
  if (!origin?.actor || !origin.uuid) return null;
  if (context && context.type !== 'spell-cast') return null;
  const card = { originUuid: origin.uuid, actorUuid: origin.actor };
  if (origin.type === 'effect') return { kind: 'effect', ...card };
  if (origin.type !== 'spell' || !casting || origin.castRank === undefined) return null;
  if (!origin.rollOptions?.includes(CAST_A_SPELL)) return null;
  return { kind: 'spell', ...card, entryId: casting.id, castRank: origin.castRank };
}

export function levelBasedDC(level: number): number {
  return LEVEL_DCS[Math.min(Math.max(level, MIN_LEVEL), MAX_LEVEL) - MIN_LEVEL];
}

export function isSpellEffect({
  spellcasting,
  originItemType,
}: {
  spellcasting?: object | null;
  originItemType?: string | null;
}): boolean {
  return !!spellcasting || originItemType === 'spell';
}

interface EffectLevels {
  /** Null when the effect's own level is unclear. */
  level: number | null;
  fromSpell: boolean;
  /** The level of the creature the effect came from, used when `level` is null. */
  creatureLevel?: number | null;
}

/** PF2e gives an effect level 1 unless something sets it, so only a spell or an item vouches for level 1. */
export function isEffectLevelClear({
  level,
  fromSpell,
  originItemType,
}: {
  level: number;
  fromSpell: boolean;
  originItemType?: string | null;
}): boolean {
  return level !== DEFAULT_EFFECT_LEVEL || fromSpell || PHYSICAL_ITEM_TYPES.has(originItemType ?? '');
}

export function effectCounteractRank({ level, fromSpell, creatureLevel }: EffectLevels): number | null {
  if (level !== null) return fromSpell ? level : halfUp(level);
  return creatureLevel == null ? null : halfUp(creatureLevel);
}

export function effectCounteractDC({
  level,
  fromSpell,
  creatureLevel,
  casterDC,
}: EffectLevels & { casterDC?: number | null }): number | null {
  if (fromSpell && casterDC != null) return casterDC;
  const basis = level ?? creatureLevel;
  return basis == null ? null : levelBasedDC(basis);
}

export function skillCounteractRank(level: number): number {
  return halfUp(level);
}

function halfUp(level: number): number {
  return Math.max(0, Math.ceil(level / 2));
}

export function casterSpellDC(
  entries: SpellcastingDC[],
  { id, tradition }: { id?: string; tradition?: string | null } = {},
): number | null {
  const byId = entries.filter((entry) => entry.id === id);
  const byTradition = tradition ? entries.filter((entry) => entry.tradition === tradition) : [];
  return highestDC(byId) ?? highestDC(byTradition) ?? highestDC(entries);
}

function highestDC(entries: SpellcastingDC[]): number | null {
  return entries.length ? Math.max(...entries.map((entry) => entry.dc)) : null;
}

export function counteracts(degree: Degree, sourceRank: number, targetRank: number): boolean {
  switch (degree) {
    case DEGREE.criticalSuccess:
      return targetRank <= sourceRank + 3;
    case DEGREE.success:
      return targetRank <= sourceRank + 1;
    case DEGREE.failure:
      return targetRank < sourceRank;
    default:
      return false;
  }
}

export function degreeNeeded(sourceRank: number, targetRank: number): Degree | null {
  const degrees = [DEGREE.failure, DEGREE.success, DEGREE.criticalSuccess] as const;
  return degrees.find((degree) => counteracts(degree, sourceRank, targetRank)) ?? null;
}

export interface HazardCounteract {
  rank: number;
  dc: number;
  rankFromText: boolean;
  dcFromText: boolean;
}

/** Enricher syntax down to the text it renders, so `@Check[thievery|dc:38]` never reads as a DC. */
function plainText(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/@(\w+)\[([^\]]*)\](?:\{([^}]*)\})?/g, (_match, type: string, body: string, label?: string) => {
      if (label !== undefined) return label;
      return type === 'UUID' ? (body.split('.').pop() ?? '') : (body.split('|')[0] ?? '');
    })
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

const HAZARD_RANK = /(\d+)(?:st|nd|rd|th)[- ](?:level|rank)|\brank (\d+)/i;
const HAZARD_DC = /counteract(?:ion)? DC (\d+)/i;

/** A hazard's counteract rank and DC from its Disable text, else from its level. */
export function hazardCounteract({ disable, level }: { disable?: string | null; level: number }): HazardCounteract {
  const text = plainText(disable);
  const rankMatch = HAZARD_RANK.exec(text);
  const dcMatch = HAZARD_DC.exec(text);
  return {
    rank: rankMatch ? Number(rankMatch[1] ?? rankMatch[2]) : halfUp(level),
    dc: dcMatch ? Number(dcMatch[1]) : levelBasedDC(level),
    rankFromText: !!rankMatch,
    dcFromText: !!dcMatch,
  };
}

/** The rank and DC a GM stored on a posted hazard counteract card. */
export interface StoredTarget {
  rank: number;
  dc: number;
}

export function storedCounteractTarget(flag: unknown): StoredTarget | null {
  const { rank, dc } = (flag ?? {}) as Partial<Record<keyof StoredTarget, unknown>>;
  return Number.isInteger(rank) && Number.isInteger(dc) ? { rank: rank as number, dc: dc as number } : null;
}

export function isCounteractSource({
  counteraction,
  description,
}: {
  counteraction?: boolean;
  description?: string | null;
}): boolean {
  return !!counteraction || /counteract/i.test(description?.replace(/<[^>]*>/g, '') ?? '');
}
