import type { ActorPF2e, ChatMessagePF2e, EffectPF2e, EffectSource, ItemPF2e, TokenDocumentPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { CounteractApplyApp, type HolderChoice } from '@/ui/CounteractApplyApp';
import { FLAG, localize, warn } from './counteract';
import {
  applyControl,
  matchesSpell,
  needsPicker,
  readCounteractFlag,
  restorePlan,
  stageStep,
  undoRecord,
  type ApplyControl,
  type CounteractFlag,
  type RestoreGroup,
  type UndoEntry,
} from './rules';

type Effect = EffectPF2e<ActorPF2e>;

interface Holder {
  actor: ActorPF2e;
  name: string;
  img: string;
  effects: Effect[];
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

function holderOf(token: TokenDocumentPF2e): Holder | null {
  const { actor } = token;
  if (!actor) return null;
  return { actor, name: token.name, img: token.texture.src ?? actor.img, effects: actor.itemTypes.effect };
}

/** The roller's targets, else every token on the viewed scene; a linked actor's tokens count once. */
function holders(flag: CounteractFlag): Holder[] {
  const targeted = flag.targets.flatMap((uuid) => {
    const token = fromUuidSync(uuid, { strict: false });
    return token instanceof CONFIG.Token.documentClass ? [token] : [];
  });
  const tokens = targeted.length ? targeted : [...(canvas.scene?.tokens ?? [])];
  const byActor = new Map<string, Holder>();
  for (const token of tokens) {
    const holder = holderOf(token);
    if (holder && !byActor.has(holder.actor.uuid)) byActor.set(holder.actor.uuid, holder);
  }
  return [...byActor.values()];
}

async function cardEffect(flag: CounteractFlag): Promise<Effect[] | null> {
  const effect = await fromUuid<ItemPF2e>(flag.originUuid);
  if (effect?.isOfType('effect') && effect.actor) return [effect as Effect];
  warn('effectGone');
  return null;
}

function choiceOf(holder: Holder, matches: Set<Effect>): HolderChoice {
  return {
    key: holder.actor.uuid,
    name: holder.name,
    img: holder.img,
    effects: holder.effects.map((effect) => ({
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      matched: matches.has(effect),
      step: stageStep(effect.system.badge, effect.isExpired),
    })),
  };
}

async function spellEffects(flag: CounteractFlag): Promise<Effect[] | null> {
  const found = holders(flag).filter((holder) => holder.effects.length);
  const matches = new Set(
    found.flatMap((holder) =>
      holder.effects.filter((effect) =>
        matchesSpell({ originItem: effect.system.context?.origin.item }, flag.originUuid),
      ),
    ),
  );
  if (!needsPicker(matches.size)) return [...matches];
  if (!found.length) {
    warn('noEffects');
    return null;
  }

  const holdsMatch = (holder: Holder) => holder.effects.some((effect) => matches.has(effect));
  const ordered = [...found.filter(holdsMatch), ...found.filter((holder) => !holdsMatch(holder))];
  const spell = fromUuidSync(flag.originUuid, { strict: false })?.name ?? localize('unknownSpell');
  const chosen = await CounteractApplyApp.choose({
    spell,
    matched: matches.size > 0,
    holders: ordered.map((holder) => choiceOf(holder, matches)),
  });
  if (!chosen) return null;
  const effects = found.flatMap((holder) => holder.effects);
  const byUuid = new Map<string, Effect>(effects.map((effect) => [effect.uuid, effect]));
  return chosen.flatMap((uuid) => byUuid.get(uuid) ?? []);
}

function chosenEffects(flag: CounteractFlag): Promise<Effect[] | null> {
  switch (flag.kind) {
    case 'hazard':
      return Promise.resolve([]);
    case 'effect':
      return cardEffect(flag);
    case 'spell':
      return spellEffects(flag);
  }
}

async function endEffects(effects: Effect[]): Promise<UndoEntry[]> {
  const byActor = new Map<ActorPF2e, Effect[]>();
  for (const effect of effects) byActor.set(effect.actor, [...(byActor.get(effect.actor) ?? []), effect]);

  const undo: UndoEntry[] = [];
  for (const [actor, held] of byActor) {
    const ended = held.map((effect) => ({
      id: effect.id,
      step: stageStep(effect.system.badge, effect.isExpired),
      data: effect.toObject() as unknown as Record<string, unknown>,
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

async function recreate(actor: ActorPF2e, create: RestoreGroup<Record<string, unknown>>['create']): Promise<void> {
  const sources = create.map(({ data }) => data as unknown as EffectSource);
  const starts = new Map(sources.map((source) => [source._id, source.system.start]));
  // EffectPF2e#_preCreate restamps the start time, which would restart the effect's duration.
  // The preCreateItem hook runs after it, so the original start goes back in the same write.
  const hook = Hooks.on('preCreateItem', (item: ItemPF2e) => {
    const start = item.parent?.uuid === actor.uuid ? starts.get(item.id) : undefined;
    if (start) item.updateSource({ system: { start } });
  });
  try {
    await actor.createEmbeddedDocuments('Item', sources, { keepId: true });
  } finally {
    Hooks.off('preCreateItem', hook);
  }
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
    if (create.length) await recreate(actor, create);
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
  const effects = await chosenEffects(flag);
  if (!effects) return;

  // The picker waits on the GM, and the roll may be rerolled or applied by another GM meanwhile.
  const message = game.messages.get(messageId);
  if (!message) {
    warn('messageGone');
    return;
  }
  const current = flagOf(message);
  if (!current?.counteracted || current.applied) return;
  const undo = await endEffects(effects);
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
