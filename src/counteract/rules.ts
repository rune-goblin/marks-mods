const CAST_A_SPELL = 'origin:action:slug:cast-a-spell';

// Copied from PF2e's `dcByLevel` (src/module/dc.ts), the GM Core table.
const LEVEL_DCS = [13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const MIN_LEVEL = -1;
const MAX_LEVEL = 25;

export const DEGREE = { criticalFailure: 0, failure: 1, success: 2, criticalSuccess: 3 } as const;
export type Degree = (typeof DEGREE)[keyof typeof DEGREE];

export type CounteractCard =
  | { kind: 'spell'; originUuid: string; casterUuid: string; entryId: string; castRank: number }
  | { kind: 'effect'; originUuid: string; casterUuid: string; entryId?: undefined; castRank?: undefined };

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

export function readCounteractCard({ context, casting, origin }: CardFlags = {}): CounteractCard | null {
  if (!origin?.actor || !origin.uuid) return null;
  if (context && context.type !== 'spell-cast') return null;
  const card = { originUuid: origin.uuid, casterUuid: origin.actor };
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

export function effectCounteractRank({ level, fromSpell }: { level: number; fromSpell: boolean }): number {
  return fromSpell ? level : Math.max(0, Math.ceil(level / 2));
}

export function effectCounteractDC({
  level,
  fromSpell,
  casterDC,
}: {
  level: number;
  fromSpell: boolean;
  casterDC?: number | null;
}): number {
  return (fromSpell ? casterDC : null) ?? levelBasedDC(level);
}

export function casterSpellDC(
  entries: SpellcastingDC[],
  { id, tradition }: { id?: string; tradition?: string | null } = {},
): number | null {
  const named = entries.filter((entry) => entry.id === id || (!!tradition && entry.tradition === tradition));
  return highestDC(named) ?? highestDC(entries);
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

export function isCounteractSource(descriptionHtml: string | null | undefined): boolean {
  return /counteract/i.test(descriptionHtml?.replace(/<[^>]*>/g, '') ?? '');
}
