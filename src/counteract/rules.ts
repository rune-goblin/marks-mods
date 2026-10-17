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

export function asDegree(value: unknown): Degree | null {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : null;
}

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

export type SourceRef =
  | { kind: 'spell'; name: string; entryId: string; spellId: string; castRank: number; slotId?: number }
  | { kind: 'skill'; name: string; slug: string };

/** What Apply changed on one effect: the source it deleted, or the stage it lowered from. */
export type UndoEntry<Data = Record<string, unknown>> =
  | { actorUuid: string; effectId: string; data: Data }
  | { actorUuid: string; effectId: string; previousStage: number };

/** The roll message's record of a counteract, and of what the GM's Apply changed. */
export interface CounteractFlag {
  card: string;
  kind: CounteractCard['kind'];
  originUuid: string;
  source: SourceRef;
  targetRank: number;
  sourceRank: number;
  dc: number;
  degree: Degree | null;
  counteracted: boolean;
  targets: string[];
  applied: boolean;
  undo: UndoEntry[];
}

const CARD_KINDS = new Set<unknown>(['spell', 'effect', 'hazard']);

export function readCounteractFlag(raw: unknown): CounteractFlag | null {
  if (!raw || typeof raw !== 'object') return null;
  const flag = raw as Partial<Record<keyof CounteractFlag, unknown>>;
  const valid =
    CARD_KINDS.has(flag.kind) &&
    typeof flag.originUuid === 'string' &&
    Number.isInteger(flag.sourceRank) &&
    Number.isInteger(flag.targetRank) &&
    typeof flag.counteracted === 'boolean' &&
    Array.isArray(flag.targets);
  if (!valid) return null;
  return {
    ...(raw as CounteractFlag),
    degree: asDegree(flag.degree),
    applied: flag.applied === true,
    undo: Array.isArray(flag.undo) ? (flag.undo as UndoEntry[]) : [],
  };
}

export type ApplyControl = 'apply' | 'undo';

/** Undo outranks Apply, so the GM can still undo an applied roll that a reroll turned into a failure. */
export function applyControl(flag: CounteractFlag | null, isGM: boolean): ApplyControl | null {
  if (!isGM || !flag) return null;
  if (flag.applied) return 'undo';
  return flag.counteracted ? 'apply' : null;
}

/** A reroll keeps what Apply already changed, so Undo still restores it. */
export function rerolledFlag(flag: CounteractFlag, degree: Degree | null): CounteractFlag {
  const counteracted = degree !== null && counteracts(degree, flag.sourceRank, flag.targetRank);
  return { ...flag, degree, counteracted };
}

export interface HeldEffect {
  /** `system.context.origin.item` */
  originItem?: string | null;
}

export function matchesSpell(effect: HeldEffect, spellUuid: string): boolean {
  return !!spellUuid && effect.originItem === spellUuid;
}

// PF2e's pack build rewrites description links to ids, so a link names a condition only by uuid.
const CONDITION_LINK = /@UUID\[(Compendium\.pf2e\.conditionitems\.Item\.[^\]]+)\]/g;

/**
 * The slugs of the conditions a spell's description links. A dropped condition carries no origin,
 * so these are how Apply recognises the Slowed that Slow imposed.
 */
export function conditionSlugsIn(
  description: string | null | undefined,
  slugOf: (uuid: string) => string | null | undefined,
): string[] {
  const slugs = [...(description ?? '').matchAll(CONDITION_LINK)].map(([, uuid]) => slugOf(uuid));
  return [...new Set(slugs.filter((slug): slug is string => !!slug))];
}

/** Apply ends a lone candidate outright; several candidates, or none, go to the GM to choose. */
export function needsPicker(candidates: number): boolean {
  return candidates !== 1;
}

export type StageStep = { type: 'remove' } | { type: 'lower'; from: number; to: number };

export interface BadgeState {
  type: string;
  value: unknown;
  min?: number | null;
}

/**
 * As PF2e's EffectPF2e#decrease, except that stage 1 ends the effect even under a badge minimum of 0.
 * A spell effect's counter is no stage (Bless counts its aura's reach, Mirror Image its images), so
 * counteracting the spell ends it whole.
 */
export function stageStep(
  badge: BadgeState | null | undefined,
  { expired = false, fromSpell = false }: { expired?: boolean; fromSpell?: boolean } = {},
): StageStep {
  if (expired || fromSpell || badge?.type !== 'counter' || typeof badge.value !== 'number') return { type: 'remove' };
  const lowest = Math.max(1, badge.min ?? 1);
  return badge.value <= lowest ? { type: 'remove' } : { type: 'lower', from: badge.value, to: badge.value - 1 };
}

export interface EndedEffect<Data> {
  id: string;
  step: StageStep;
  data: Data;
}

/** A removal enters the record only once the effect is gone, since PF2e can refuse to delete a granted item. */
export function undoRecord<Data>(
  actorUuid: string,
  ended: EndedEffect<Data>[],
  remaining: ReadonlySet<string>,
): UndoEntry<Data>[] {
  return ended.flatMap(({ id, step, data }): UndoEntry<Data>[] => {
    if (step.type === 'lower') return [{ actorUuid, effectId: id, previousStage: step.from }];
    return remaining.has(id) ? [] : [{ actorUuid, effectId: id, data }];
  });
}

export interface RestoreGroup<Data> {
  actorUuid: string;
  create: { effectId: string; data: Data }[];
  reset: { effectId: string; stage: number }[];
}

/**
 * Undo's writes per actor. An effect already back can't be recreated under its id, and a lowered
 * effect that has since gone has no badge to reset; both land in `skipped`.
 */
export function restorePlan<Data>(
  undo: UndoEntry<Data>[],
  holds: (actorUuid: string, effectId: string) => boolean,
): { groups: RestoreGroup<Data>[]; skipped: UndoEntry<Data>[] } {
  const groups = new Map<string, RestoreGroup<Data>>();
  const skipped: UndoEntry<Data>[] = [];
  for (const entry of undo) {
    const { actorUuid, effectId } = entry;
    const held = holds(actorUuid, effectId);
    const restores = 'data' in entry ? !held : held;
    if (!restores) {
      skipped.push(entry);
      continue;
    }
    const group = groups.get(actorUuid) ?? { actorUuid, create: [], reset: [] };
    groups.set(actorUuid, group);
    if ('data' in entry) group.create.push({ effectId, data: entry.data });
    else group.reset.push({ effectId, stage: entry.previousStage });
  }
  return { groups: [...groups.values()], skipped };
}

/** The reroll a client is following, from `pf2e.reroll` to the replacement message's creation. */
export interface RerollTrack<Flag> {
  /** The rerolled roll's key, until the message holding it is deleted. */
  pending: string | null;
  carried: { flag: Flag; notes: string } | null;
}

export function rerollStarted<Flag>(rollKey: string): RerollTrack<Flag> {
  return { pending: rollKey, carried: null };
}

/**
 * A roll's identity without its options. PF2e's reroll clones the old roll, and Roll#clone shares
 * the options object, so setting the clone's `isReroll` and degree rewrites the old roll's too.
 */
export function rollKey(rollJSON: object): string {
  const { options: _options, ...identity } = rollJSON as Record<string, unknown>;
  return JSON.stringify(identity);
}

/** Only the deletion of the message holding the rerolled roll picks up its flag. */
export function rerollDeleting<Flag>(
  track: RerollTrack<Flag>,
  deleted: { rollKey: string | null; flag: Flag | null; notes: string },
): RerollTrack<Flag> {
  if (!track.pending || deleted.rollKey !== track.pending) return track;
  return { pending: null, carried: deleted.flag ? { flag: deleted.flag, notes: deleted.notes } : null };
}

/**
 * Any reroll creation ends what was carried; the carried flag goes only to the one whose PF2e
 * notes match, since the reroll copies the old message's PF2e flags whole.
 */
export function rerollCreating<Flag>(
  track: RerollTrack<Flag>,
  created: { notes: string },
): { track: RerollTrack<Flag>; flag: Flag | null } {
  const flag = track.carried?.notes === created.notes ? track.carried.flag : null;
  return { track: { ...track, carried: null }, flag };
}
