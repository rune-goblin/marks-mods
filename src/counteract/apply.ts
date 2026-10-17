import type {
  ActorPF2e,
  ChatMessagePF2e,
  ConditionPF2e,
  EffectPF2e,
  ItemPF2e,
  ItemSourcePF2e,
  TokenDocumentPF2e,
} from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { CounteractApplyApp, type EffectChoice, type HolderChoice } from '@/ui/CounteractApplyApp';
import { FLAG, localize, warn } from './counteract';
import {
  applyControl,
  conditionSlugsIn,
  isSpellEffect,
  matchesSpell,
  needsPicker,
  readCounteractFlag,
  restorePlan,
  stageStep,
  undoRecord,
  type ApplyControl,
  type CounteractFlag,
  type RestoreGroup,
  type StageStep,
  type UndoEntry,
} from './rules';

type Effect = EffectPF2e<ActorPF2e>;
type Ending = Effect | ConditionPF2e<ActorPF2e>;
type Match = NonNullable<EffectChoice['match']>;

interface Holder {
  actor: ActorPF2e;
  name: string;
  img: string;
  endings: Ending[];
}

const ICONS: Record<ApplyControl, string> = { apply: 'fa-shield-halved', undo: 'fa-rotate-left' };

// One run per message, however many chat views (log, popout, notifications) show its buttons.
const busy = new Set<string>();

function flagOf(message: ChatMessagePF2e | undefined): CounteractFlag | null {
  return message ? readCounteractFlag(message.flags[MODULE_ID]?.[FLAG]) : null;
}

function actorAt(uuid: string): ActorPF2e | null {
  const actor = fromUuidSync(uuid, { strict: false });
  return actor instanceof CONFIG.Actor.documentClass ? actor : null;
}

// A condition another item applied ends with that item, which the list already holds.
function endingsOf(actor: ActorPF2e): Ending[] {
  return [...actor.itemTypes.effect, ...actor.conditions.active.filter((condition) => !condition.appliedBy)];
}

function holdersOf(tokens: TokenDocumentPF2e[]): Holder[] {
  const byActor = new Map<string, Holder>();
  for (const token of tokens) {
    const { actor } = token;
    if (!actor || byActor.has(actor.uuid)) continue;
    const img = token.texture.src ?? actor.img;
    byActor.set(actor.uuid, { actor, name: token.name, img, endings: endingsOf(actor) });
  }
  return [...byActor.values()];
}

function targetTokens(flag: CounteractFlag): TokenDocumentPF2e[] {
  return flag.targets.flatMap((uuid) => {
    const token = fromUuidSync(uuid, { strict: false });
    return token instanceof CONFIG.Token.documentClass ? [token] : [];
  });
}

function effectFromSpell(effect: Effect): boolean {
  const origin = effect.system.context?.origin;
  const originItemType = origin?.item ? (fromUuidSync<ItemPF2e>(origin.item, { strict: false })?.type ?? null) : null;
  return effect.system.fromSpell || isSpellEffect({ spellcasting: origin?.spellcasting, originItemType });
}

function stepOf(ending: Ending): StageStep {
  if (ending.isOfType('condition')) return { type: 'remove' };
  return stageStep(ending.system.badge, { expired: ending.isExpired, fromSpell: effectFromSpell(ending) });
}

function namedConditions(spellUuid: string): Set<string> {
  const spell = fromUuidSync(spellUuid, { strict: false });
  if (!(spell instanceof CONFIG.Item.documentClass) || !spell.isOfType('spell')) return new Set();
  const { conditions } = game.pf2e.ConditionManager;
  // The map is keyed by slug and by compendium uuid alike.
  const slugOf = (uuid: string) => conditions.get(uuid as Parameters<typeof conditions.get>[0])?.slug;
  return new Set(conditionSlugsIn(spell.system.description.value, slugOf));
}

function matchOf(ending: Ending, spellUuid: string, named: Set<string>): Match | null {
  if (ending.isOfType('condition')) return named.has(ending.slug) ? 'named' : null;
  return matchesSpell({ originItem: ending.system.context?.origin.item }, spellUuid) ? 'origin' : null;
}

function matchesIn(holders: Holder[], spellUuid: string, named: Set<string>): Map<Ending, Match> {
  const matches = new Map<Ending, Match>();
  for (const ending of holders.flatMap((holder) => holder.endings)) {
    const match = matchOf(ending, spellUuid, named);
    if (match) matches.set(ending, match);
  }
  return matches;
}

function labelOf(ending: Ending): string {
  return ending.isOfType('condition') && ending.value ? `${ending.name} ${ending.value}` : ending.name;
}

function choiceOf(holder: Holder, matches: Map<Ending, Match>): HolderChoice {
  return {
    key: holder.actor.uuid,
    name: holder.name,
    img: holder.img,
    effects: holder.endings.map((ending) => ({
      uuid: ending.uuid,
      name: labelOf(ending),
      img: ending.img,
      match: matches.get(ending) ?? null,
      step: stepOf(ending),
    })),
  };
}

async function cardEffect(flag: CounteractFlag): Promise<Ending[] | null> {
  const effect = await fromUuid<ItemPF2e>(flag.originUuid);
  if (effect?.isOfType('effect') && effect.actor) return [effect as Effect];
  warn('effectGone');
  return null;
}

/**
 * Spell card candidates: effects whose origin is the spell, and conditions its description names.
 * The roller's targets come first; when they hold no candidate, the viewed scene's tokens join them,
 * and the GM confirms any candidate found there, since the roller did not target it.
 */
async function spellEndings(flag: CounteractFlag): Promise<Ending[] | null> {
  const named = namedConditions(flag.originUuid);
  const targeted = targetTokens(flag);
  const scene = [...(canvas.scene?.tokens ?? [])];
  let holders = holdersOf(targeted.length ? targeted : scene);
  let matches = matchesIn(holders, flag.originUuid, named);
  const widened = targeted.length > 0 && matches.size === 0;
  if (widened) {
    holders = holdersOf([...targeted, ...scene]);
    matches = matchesIn(holders, flag.originUuid, named);
  }
  if (!widened && !needsPicker(matches.size)) return [...matches.keys()];

  const listed = holders.filter((holder) => holder.endings.length);
  if (!listed.length) {
    warn('noEffects');
    return null;
  }
  const holdsMatch = (holder: Holder) => holder.endings.some((ending) => matches.has(ending));
  const ordered = [...listed.filter(holdsMatch), ...listed.filter((holder) => !holdsMatch(holder))];
  const spell = fromUuidSync(flag.originUuid, { strict: false })?.name ?? localize('unknownSpell');
  const chosen = await CounteractApplyApp.choose({
    spell,
    matched: matches.size > 0,
    widened,
    holders: ordered.map((holder) => choiceOf(holder, matches)),
  });
  if (!chosen) return null;
  const endings = listed.flatMap((holder) => holder.endings);
  const byUuid = new Map<string, Ending>(endings.map((ending) => [ending.uuid, ending]));
  return chosen.flatMap((uuid) => byUuid.get(uuid) ?? []);
}

function chosenEndings(flag: CounteractFlag): Promise<Ending[] | null> {
  switch (flag.kind) {
    case 'hazard':
      return Promise.resolve([]);
    case 'effect':
      return cardEffect(flag);
    case 'spell':
      return spellEndings(flag);
  }
}

async function end(endings: Ending[]): Promise<UndoEntry[]> {
  const byActor = new Map<ActorPF2e, Ending[]>();
  for (const ending of endings) byActor.set(ending.actor, [...(byActor.get(ending.actor) ?? []), ending]);

  const undo: UndoEntry[] = [];
  for (const [actor, held] of byActor) {
    const ended = held.map((ending) => ({
      id: ending.id,
      step: stepOf(ending),
      data: ending.toObject() as unknown as Record<string, unknown>,
    }));
    const removals = ended.flatMap(({ id, step }) => (step.type === 'remove' ? [id] : []));
    const lowerings = ended.flatMap(({ id, step }) =>
      step.type === 'lower' ? [{ _id: id, system: { badge: { value: step.to } } }] : [],
    );
    if (removals.length) await actor.deleteEmbeddedDocuments('Item', removals);
    if (lowerings.length) await actor.updateEmbeddedDocuments('Item', lowerings);
    undo.push(...undoRecord(actor.uuid, ended, new Set(actor.items.keys())));
  }
  return undo;
}

/** Recreates under the recorded ids; returns how many PF2e declined, e.g. to an immunity gained since. */
async function recreate(actor: ActorPF2e, create: RestoreGroup<Record<string, unknown>>['create']): Promise<number> {
  const sources = create.map(({ data }) => data as unknown as ItemSourcePF2e);
  const starts = new Map(
    sources.flatMap((source) => (source.type === 'effect' && source._id ? [[source._id, source.system.start]] : [])),
  );
  // EffectPF2e#_preCreate restamps the start time, which would restart the effect's duration.
  // The preCreateItem hook runs after it, so the original start goes back in the same write.
  const hook = Hooks.on('preCreateItem', (item: ItemPF2e) => {
    if (!item.isOfType('effect') || item.parent?.uuid !== actor.uuid) return;
    const start = starts.get(item.id);
    if (start) item.updateSource({ system: { start } });
  });
  try {
    await actor.createEmbeddedDocuments('Item', sources, { keepId: true });
  } finally {
    Hooks.off('preCreateItem', hook);
  }
  return create.filter(({ effectId }) => !actor.items.has(effectId)).length;
}

async function restore(undo: UndoEntry[]): Promise<void> {
  const actors = new Map<string, ActorPF2e | null>();
  const actorFor = (uuid: string): ActorPF2e | null => {
    if (!actors.has(uuid)) actors.set(uuid, actorAt(uuid));
    return actors.get(uuid) ?? null;
  };
  const { groups, skipped } = restorePlan(undo, (actorUuid, effectId) => !!actorFor(actorUuid)?.items.has(effectId));

  let missed = skipped.length;
  for (const { actorUuid, create, reset } of groups) {
    const actor = actorFor(actorUuid);
    if (!actor) {
      missed += create.length + reset.length;
      continue;
    }
    if (create.length) missed += await recreate(actor, create);
    if (reset.length) {
      const updates = reset.map(({ effectId, stage }) => ({ _id: effectId, system: { badge: { value: stage } } }));
      await actor.updateEmbeddedDocuments('Item', updates);
    }
  }
  if (missed) warn('undoSkipped', { count: missed });
}

async function apply(messageId: string): Promise<void> {
  const flag = flagOf(game.messages.get(messageId));
  if (!flag?.counteracted || flag.applied) return;
  const chosen = await chosenEndings(flag);
  if (!chosen) return;

  // The picker waits on the GM, and the roll may be rerolled or applied by another GM meanwhile.
  const message = game.messages.get(messageId);
  if (!message) {
    warn('messageGone');
    return;
  }
  const current = flagOf(message);
  if (!current?.counteracted || current.applied) return;
  // Deleting an id that is already gone makes the whole deletion throw partway through.
  const endings = chosen.filter((ending) => ending.actor.items.get(ending.id) === ending);
  if (chosen.length && !endings.length) {
    warn('effectGone');
    return;
  }
  const undo = await end(endings);
  await message.update({ flags: { [MODULE_ID]: { [FLAG]: { applied: true, undo } } } });
}


async function undo(messageId: string): Promise<void> {
  const message = game.messages.get(messageId);
  const flag = flagOf(message);
  if (!message || !flag?.applied) return;
  await restore(flag.undo);
  await message.update({ flags: { [MODULE_ID]: { [FLAG]: { applied: false, undo: [] } } } });
}

async function run(messageId: string, control: ApplyControl): Promise<void> {
  if (busy.has(messageId)) return;
  busy.add(messageId);
  try {
    await (control === 'apply' ? apply(messageId) : undo(messageId));
  } finally {
    busy.delete(messageId);
  }
}

function controlRow(message: ChatMessagePF2e, flag: CounteractFlag, control: ApplyControl): HTMLElement {
  const row = document.createElement('div');
  row.className = `${MODULE_ID} ${MODULE_ID}-counteract-apply`;
  if (control === 'undo') {
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = localize(flag.kind === 'hazard' ? 'apply.hazardApplied' : 'apply.applied');
    row.append(status);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = control;
  const icon = document.createElement('i');
  icon.className = `fa-solid ${ICONS[control]}`;
  icon.inert = true;
  button.append(icon, localize(`apply.${control}`));
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await run(message.id, control);
    } finally {
      button.disabled = false;
    }
  });
  row.append(button);
  return row;
}

function onRender(message: ChatMessagePF2e, html: HTMLElement): void {
  const flag = flagOf(message);
  const control = applyControl(flag, game.user.isGM);
  if (!flag || !control) return;
  html.querySelector('.message-content')?.append(controlRow(message, flag, control));
}

export function registerApply(): void {
  Hooks.on('renderChatMessageHTML', onRender);
}
