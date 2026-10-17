import type {
  ActorPF2e,
  ChatMessagePF2e,
  HazardPF2e,
  ItemPF2e,
  SpellPF2e,
  SpellcastingEntryPF2e,
} from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import {
  DEGREE,
  casterSpellDC,
  counteracts,
  effectCounteractDC,
  effectCounteractRank,
  hazardCounteract,
  isCounteractSource,
  isEffectLevelClear,
  isSpellEffect,
  readCounteractCard,
  skillCounteractRank,
  type CardSpeaker,
  type CounteractCard,
  type Degree,
  type SpellcastingDC,
} from './rules';

const FLAG = 'counteract';
const NOTE_SELECTOR = 'counteract-check';

export type SourceRef =
  | { kind: 'spell'; name: string; entryId: string; spellId: string; castRank: number; slotId?: number }
  | { kind: 'skill'; name: string; slug: string };

export interface SpellSource {
  kind: 'spell';
  key: string;
  entry: SpellcastingEntryPF2e<ActorPF2e>;
  spell: SpellPF2e<ActorPF2e>;
  castRank: number;
  slotId?: number;
  slots: number;
  flagged: boolean;
  counteracts: boolean;
}

export interface SkillSource {
  kind: 'skill';
  key: string;
  slug: string;
  label: string;
  modifier: number;
}

export type CounteractSource = SpellSource | SkillSource;

export interface PickerSession {
  actor: ActorPF2e;
  cardId: string;
  card: CounteractCard;
  targetName: string;
  skillRank: number;
  spells: SpellSource[];
  skills: SkillSource[];
}

export interface CounteractRequest {
  requestId: string;
  userId: string;
  cardId: string;
  actorUuid: string;
  source: SourceRef;
  sourceRank: number;
}

export interface Approval {
  targetName: string;
  targetRank: number;
  sourceRank: number;
  dc: number;
}

export type Reply = { type: 'approve'; approval: Approval } | { type: 'refuse' } | { type: 'cancel' };

/** The GM's starting values; a null rank or DC leaves the field blank for the GM to fill. */
export interface TargetSuggestion {
  name: string;
  img: string | null;
  /** The card or its effect is gone, so the GM can only refuse. */
  gone: boolean;
  rank: number | null;
  rankBasis: string;
  dc: number | null;
  dcBasis: string;
}

interface CounteractFlag {
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
}

export function localize(key: string, data?: Record<string, string | number>): string {
  const path = `${MODULE_ID}.counteract.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

export function warn(key: string, data?: Record<string, string | number>): void {
  ui.notifications.warn(localize(`warn.${key}`, data));
}

export function rollerActor(): ActorPF2e | null {
  return canvas.tokens?.controlled[0]?.actor ?? game.user.character ?? null;
}

// fromUuidSync hands back a bare index entry for a compendium actor.
function actorAt(uuid: string): ActorPF2e | null {
  const actor = fromUuidSync(uuid, { strict: false });
  return actor instanceof CONFIG.Actor.documentClass ? actor : null;
}

function cardSpeaker(message: ChatMessagePF2e): CardSpeaker | null {
  const originActor = message.flags.pf2e.origin?.actor;
  const actors = [message.actor, originActor ? actorAt(originActor) : null];
  const actor = actors.find((candidate) => candidate?.isOfType('hazard')) ?? message.actor;
  return actor ? { uuid: actor.uuid, type: actor.type } : null;
}

export function readCard(message: ChatMessagePF2e): CounteractCard | null {
  return readCounteractCard(message.flags.pf2e, cardSpeaker(message));
}

/** The roller's view of the target: its name only, since the GM sets the rank and DC. */
export function cardTargetName(message: ChatMessagePF2e, card: CounteractCard): string {
  const name = card.kind === 'spell' ? message.item?.name : fromUuidSync(card.originUuid, { strict: false })?.name;
  return name ?? localize('unknownTarget');
}

// Scroll, wand and trick-magic casts name an entry the actor's list may lack; casterSpellDC
// then falls back to the highest DC.
function spellcastingDCs(actor: ActorPF2e): SpellcastingDC[] {
  return (actor.spellcasting?.contents ?? []).flatMap((entry) =>
    entry.statistic ? [{ id: entry.id, tradition: entry.tradition, dc: entry.statistic.dc.value }] : [],
  );
}

function goneTarget(): TargetSuggestion {
  return { name: localize('unknownTarget'), img: null, gone: true, rank: null, rankBasis: '', dc: null, dcBasis: '' };
}

function spellTarget(message: ChatMessagePF2e, card: Extract<CounteractCard, { kind: 'spell' }>): TargetSuggestion {
  const caster = fromUuidSync<ActorPF2e>(card.actorUuid);
  const dc = caster ? casterSpellDC(spellcastingDCs(caster), { id: card.entryId }) : null;
  const spell = message.item;
  const name = spell?.name ?? localize('unknownSpell');
  return {
    name,
    img: spell?.img ?? null,
    gone: false,
    rank: card.castRank,
    rankBasis: localize('basis.cast', { name, rank: card.castRank }),
    dc,
    dcBasis: localize(dc === null ? 'basis.noCaster' : 'basis.casterDC'),
  };
}

function effectRankBasis({
  level,
  clear,
  fromSpell,
  creatureLevel,
}: {
  level: number | null;
  clear: boolean;
  fromSpell: boolean;
  creatureLevel: number | null;
}): string {
  if (level === null) return localize('basis.creatureLevel', { level: creatureLevel ?? 0 });
  if (!clear) return localize('basis.defaultLevel', { level });
  return localize(fromSpell ? 'basis.spellEffect' : 'basis.effectLevel', { level });
}

type TargetValues = Pick<TargetSuggestion, 'rank' | 'rankBasis' | 'dc' | 'dcBasis'>;

function hazardValues(hazard: HazardPF2e): TargetValues {
  const { level } = hazard;
  const { rank, dc, rankFromText, dcFromText } = hazardCounteract({ disable: hazard.system.details.disable, level });
  const fromText = localize('basis.hazardText');
  return {
    rank,
    rankBasis: rankFromText ? fromText : localize('basis.hazardLevel', { level }),
    dc,
    dcBasis: dcFromText ? fromText : localize('basis.levelDC', { level }),
  };
}

function hazardTarget(card: Extract<CounteractCard, { kind: 'hazard' }>): TargetSuggestion {
  const hazard = actorAt(card.originUuid);
  if (!hazard?.isOfType('hazard')) return goneTarget();
  return { name: hazard.name, img: hazard.img, gone: false, ...hazardValues(hazard) };
}

function effectTarget(card: Extract<CounteractCard, { kind: 'effect' }>): TargetSuggestion {
  const effect = fromUuidSync<ItemPF2e>(card.originUuid, { strict: false });
  if (!effect?.isOfType('effect')) return goneTarget();

  const origin = effect.system.context?.origin;
  // `effect.origin` alone falls back to the holder when the context names no actor.
  const originActor = origin?.actor ? effect.origin : null;
  const target = { name: effect.name, img: effect.img, gone: false };
  if (originActor?.isOfType('hazard')) return { ...target, ...hazardValues(originActor) };

  const effectLevel = effect.system.level.value;
  const originItem = origin?.item ? fromUuidSync<ItemPF2e>(origin.item, { strict: false }) : null;
  const originItemType = originItem?.type ?? null;
  const fromSpell =
    effect.system.fromSpell || isSpellEffect({ spellcasting: origin?.spellcasting, originItemType });
  const creature = originActor?.isOfType('creature') ? originActor : null;
  const clear = isEffectLevelClear({ level: effectLevel, fromSpell, originItemType });
  const level = clear || !creature ? effectLevel : null;
  const creatureLevel = creature?.level ?? null;
  const casterDC = originActor
    ? casterSpellDC(spellcastingDCs(originActor), { tradition: origin?.spellcasting?.tradition })
    : null;

  const usesCasterDC = fromSpell && casterDC !== null;
  return {
    ...target,
    rank: effectCounteractRank({ level, fromSpell, creatureLevel }),
    rankBasis: effectRankBasis({ level, clear, fromSpell, creatureLevel }),
    dc: effectCounteractDC({ level, fromSpell, creatureLevel, casterDC }),
    dcBasis: usesCasterDC
      ? localize('basis.casterDC')
      : localize('basis.levelDC', { level: level ?? creatureLevel ?? 0 }),
  };
}

export function suggestTarget(cardId: string): TargetSuggestion {
  const message = game.messages.get(cardId);
  const card = message ? readCard(message) : null;
  if (!message || !card) return goneTarget();
  switch (card.kind) {
    case 'spell':
      return spellTarget(message, card);
    case 'effect':
      return effectTarget(card);
    case 'hazard':
      return hazardTarget(card);
  }
}

function bySpell(a: SpellSource, b: SpellSource): number {
  return (
    Number(b.flagged) - Number(a.flagged) ||
    Number(b.counteracts) - Number(a.counteracts) ||
    a.spell.name.localeCompare(b.spell.name, game.i18n.lang) ||
    b.castRank - a.castRank
  );
}

/** One source per castable (entry, spell, rank); prepared copies of it collapse into `slots`. */
export async function spellSources(actor: ActorPF2e): Promise<SpellSource[]> {
  if (!actor.isOfType('character', 'npc')) return [];
  const sources = new Map<string, SpellSource>();
  for (const entry of actor.spellcasting.regular) {
    const { groups } = await entry.getSheetData();
    for (const group of groups) {
      // A spent focus pool or flexible rank marks no slot expended, only the group's uses.
      const exhausted = group.uses?.value === 0;
      group.active.forEach((slot, index) => {
        if (!slot || ((slot.expended || exhausted) && !slot.spell.atWill)) return;
        const { spell } = slot;
        const castRank = slot.castRank ?? spell.rank;
        const key = `${entry.id}.${spell.id}.${castRank}`;
        const known = sources.get(key);
        if (known) {
          known.slots++;
          return;
        }
        const { counteraction } = spell.system;
        sources.set(key, {
          kind: 'spell',
          key,
          entry,
          spell,
          castRank,
          slotId: entry.isPrepared ? index : undefined,
          slots: 1,
          flagged: counteraction,
          counteracts: isCounteractSource({ counteraction, description: spell.system.description.value }),
        });
      });
    }
  }
  return [...sources.values()].sort(bySpell);
}

export function skillSources(actor: ActorPF2e): SkillSource[] {
  if (!actor.isOfType('creature')) return [];
  return Object.entries(actor.skills)
    .map(([slug, skill]): SkillSource => ({
      kind: 'skill',
      key: `skill.${slug}`,
      slug,
      label: skill.label,
      modifier: skill.check.mod,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

export function sourceRef(source: CounteractSource): SourceRef {
  if (source.kind === 'skill') return { kind: 'skill', name: source.label, slug: source.slug };
  const { entry, spell, castRank, slotId } = source;
  return { kind: 'spell', name: spell.name, entryId: entry.id, spellId: spell.id, castRank, slotId };
}

export function sourceRank(session: PickerSession, source: CounteractSource): number {
  return source.kind === 'spell' ? source.castRank : session.skillRank;
}

export function skillRank(actor: ActorPF2e): number {
  return skillCounteractRank(actor.level);
}

// PF2e shows only the note whose outcome matches the rolled degree.
function rollNotes({ sourceRank, targetName, targetRank }: Approval) {
  const target = { target: foundry.utils.escapeHTML(targetName), rank: targetRank };
  const visibility = game.pf2e.settings.metagame.results ? null : ('gm' as const);
  const outcomes = Object.entries(DEGREE) as [keyof typeof DEGREE, Degree][];
  return outcomes.map(([outcome, degree]) => ({
    selector: NOTE_SELECTOR,
    text: localize(counteracts(degree, sourceRank, targetRank) ? 'note.counteracted' : 'note.notCounteracted', target),
    outcome: [outcome],
    visibility,
  }));
}

export async function rollCounteract(
  session: PickerSession,
  source: CounteractSource,
  approval: Approval,
): Promise<void> {
  const { actor } = session;
  const ref = sourceRef(source);
  const name = foundry.utils.escapeHTML(approval.targetName);
  const targets = [...game.user.targets].map((token) => token.document.uuid);
  const common = {
    dc: { value: approval.dc, label: localize('dcLabel', { target: name }) },
    label: localize('rollLabel', { target: name }),
    extraRollNotes: rollNotes(approval),
    callback: async (rolled: { degreeOfSuccess: Degree | null }, _outcome: unknown, message: ChatMessagePF2e) => {
      const degree = rolled.degreeOfSuccess;
      const flag: CounteractFlag = {
        card: session.cardId,
        kind: session.card.kind,
        originUuid: session.card.originUuid,
        source: ref,
        targetRank: approval.targetRank,
        sourceRank: approval.sourceRank,
        dc: approval.dc,
        degree,
        counteracted: degree !== null && counteracts(degree, approval.sourceRank, approval.targetRank),
        targets,
      };
      await message.update({ flags: { [MODULE_ID]: { [FLAG]: flag } } });
    },
  };

  if (source.kind === 'skill') {
    const skill = actor.isOfType('creature') ? actor.skills[source.slug] : undefined;
    await skill?.check.roll({ ...common, extraRollOptions: ['action:counteract'] });
    return;
  }

  const { entry, spell, castRank, slotId } = source;
  const pays = !spell.atWill;
  if (pays && !(await entry.consume(spell, castRank, slotId))) return;
  const cast = spell.loadVariant({ castRank }) ?? spell;
  const traits = new Set<string>(cast.system.traits.value);
  if (entry.tradition) traits.add(entry.tradition);
  const roll = await entry.counteraction.check.roll({
    ...common,
    traits: [...traits],
    extraRollOptions: cast.getRollOptions('item').filter((option) => option.startsWith('item:')),
  });
  if (!roll && pays) warn('paidNoRoll', { spell: spell.name });
}
