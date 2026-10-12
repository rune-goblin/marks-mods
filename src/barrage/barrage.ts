import type {
  ActorPF2e,
  ChatMessagePF2e,
  ConsumablePF2e,
  EffectPF2e,
  ItemPF2e,
  SpellPF2e,
  SpellcastingEntryPF2e,
  TokenDocumentPF2e,
} from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { DEFAULT_ACTIONS, distribute, isForceBarrageSlug, isShardstormSlug, shardsPerAction } from './rules';

const FLAG = 'shardstorm';
const CAST_A_SPELL = 'origin:action:slug:cast-a-spell';
const DURATION_ROUNDS = 10;
const CARD_GRACE_MS = 10_000;

export type ShardstormEffect = EffectPF2e<ActorPF2e>;

export interface Assignment {
  token: string;
  shards: number;
}

export interface Barrage {
  actor: ActorPF2e;
  name: string;
  img: string;
  rank: number;
  perAction: number;
  /** The cast has not happened yet: closing the window spends nothing. */
  pending: boolean;
  ongoing: boolean;
  opening: boolean;
  targets: Assignment[];
  fire(volley: Assignment[], event: PointerEvent): Promise<boolean>;
  save(targets: Assignment[]): Promise<void>;
}

interface ShardstormFlag {
  user: string;
  wand: string;
  entry: string;
  rank: number;
  opening: boolean;
  firedRound: number | null;
  targets: Assignment[];
}

interface Cast {
  spell: SpellPF2e<ActorPF2e>;
  entry: string;
  wand?: ConsumablePF2e<ActorPF2e>;
}

interface PendingCast {
  volley: Assignment[];
  event: PointerEvent;
  claimed: () => void;
  finish: () => void;
}

const pendingCasts = new Map<string, PendingCast>();

export function localize(key: string, data?: Record<string, string | number>): string {
  const path = `${MODULE_ID}.barrage.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

function slugOf(item: ItemPF2e): string {
  return item.slug ?? game.pf2e.system.sluggify(item.name);
}

export function shardstormFlag(item: ItemPF2e): ShardstormFlag | undefined {
  return item.flags[MODULE_ID]?.[FLAG] as ShardstormFlag | undefined;
}

export function tokenOf(uuid: string): TokenDocumentPF2e | null {
  return fromUuidSync<TokenDocumentPF2e>(uuid);
}

export function targetName(token: TokenDocumentPF2e): string {
  return game.user.isGM || token.playersCanSeeName ? token.name : localize('unknownTarget');
}

export function tokenImage(token: TokenDocumentPF2e): string {
  return token.texture.src ?? token.actor?.img ?? '';
}

export function targetedTokens(caster: ActorPF2e): string[] {
  return [...game.user.targets]
    .map((token) => token.document)
    .filter((token) => token.actor !== caster && token.actor?.isOfType('creature', 'hazard', 'vehicle'))
    .map((token) => token.uuid);
}

function prefill(caster: ActorPF2e, perAction: number): Assignment[] {
  const shards = DEFAULT_ACTIONS * perAction;
  const tokens = targetedTokens(caster).slice(0, shards);
  const counts = distribute(shards, tokens.length);
  return tokens.map((token, index) => ({ token, shards: counts[index] }));
}

function currentRound(): number | null {
  return game.combat?.started ? game.combat.round : null;
}

export function readCast(message: ChatMessagePF2e): Cast | null {
  const { casting, origin } = message.flags.pf2e;
  if (!casting || !origin?.rollOptions?.includes(CAST_A_SPELL)) return null;
  const spell = message.item;
  if (!spell?.isOfType('spell') || !isForceBarrageSlug(slugOf(spell))) return null;

  const embeddedId = casting.embeddedSpell?._id;
  const wand = embeddedId
    ? spell.actor.itemTypes.consumable.find(
        (item) => item.system.spell?._id === embeddedId && isShardstormSlug(slugOf(item)),
      )
    : undefined;
  return { spell, entry: casting.id, wand };
}

/** A window opened before the cast: firing commits the cast, closing it spends nothing. */
function pendingBarrage(
  actor: ActorPF2e,
  source: { name: string; img: string; rank: number },
  commit: () => Promise<void>,
  grace: number,
): Barrage {
  const perAction = shardsPerAction(source.rank);
  return {
    actor,
    ...source,
    perAction,
    pending: true,
    ongoing: false,
    opening: true,
    targets: prefill(actor, perAction),
    fire: (volley, event) => commitCast(actor, volley, event, commit, grace),
    save: async () => {},
  };
}

async function commitCast(
  actor: ActorPF2e,
  volley: Assignment[],
  event: PointerEvent,
  commit: () => Promise<void>,
  grace: number,
): Promise<boolean> {
  const key = actor.uuid;
  let claimed!: () => void;
  let finish!: () => void;
  const claim = new Promise<true>((resolve) => (claimed = () => resolve(true)));
  const rolled = new Promise<void>((resolve) => (finish = resolve));
  pendingCasts.set(key, { volley, event, claimed, finish });

  try {
    await commit();
  } catch (error) {
    pendingCasts.delete(key);
    throw error;
  }
  // The system reports a failed cast only through a notification, so its spell card is the
  // proof. A wand or scroll posts that card without awaiting it, hence the grace period.
  const lapse = new Promise<false>((resolve) => window.setTimeout(() => resolve(false), grace));
  if (!(await Promise.race([claim, lapse]))) {
    pendingCasts.delete(key);
    ui.notifications.warn(localize('warn.noCast'));
    return false;
  }
  await rolled;
  return true;
}

/** Hands a just-posted spell card to the window that committed it. */
export function claimCast(cast: Cast): boolean {
  const key = cast.spell.actor.uuid;
  const pending = pendingCasts.get(key);
  if (!pending) return false;
  pendingCasts.delete(key);
  pending.claimed();

  const { volley, event } = pending;
  const resolve = async (): Promise<void> => {
    if (cast.wand) await grantShardstorm(cast, cast.wand, volley.map((target) => target.token));
    await fireVolley(cast, volley, event);
  };
  void resolve().finally(pending.finish);
  return true;
}

let patched = false;

/**
 * PF2e spends a slot, charge or scroll the moment a cast is clicked and offers no hook before
 * that, so the two entry points are patched to open the window first and cast on Fire.
 */
export function installCastPatch(open: (barrage: Barrage) => void): void {
  if (patched) return;
  patched = true;

  const entry = CONFIG.PF2E.Item.documentClasses.spellcastingEntry.prototype;
  const cast = entry.cast;
  entry.cast = async function (this: SpellcastingEntryPF2e<ActorPF2e>, spell, options = {}) {
    // `consume: false` is a wand or scroll casting through this entry; `message: false` is a
    // macro spending a slot on its own. Neither is a cast for the window to hold back.
    const deferred = options.consume !== false && options.message !== false && isForceBarrageSlug(slugOf(spell));
    if (!deferred) return cast.call(this, spell, options);
    const rank = spell.computeCastRank(options.rank ?? spell.rank);
    const source = { name: spell.name, img: spell.img, rank };
    open(pendingBarrage(spell.actor, source, () => cast.call(this, spell, options), 0));
  };

  const consumable = CONFIG.PF2E.Item.documentClasses.consumable.prototype;
  const consume = consumable.consume;
  consumable.consume = async function (this: ConsumablePF2e, thisMany = 1) {
    const actor = this.actor;
    const spell = actor && this.system.spell ? this.embeddedSpell : null;
    if (!actor || !spell || !isForceBarrageSlug(slugOf(spell))) return consume.call(this, thisMany);
    const source = isShardstormSlug(slugOf(this))
      ? { name: localize('effect.name'), img: this.img, rank: spell.rank }
      : { name: spell.name, img: spell.img, rank: spell.rank };
    open(pendingBarrage(actor, source, () => consume.call(this, thisMany), CARD_GRACE_MS));
  };
}

/** A cast that reached chat without passing through the patch, such as one from a staff. */
export function castBarrage(message: ChatMessagePF2e, cast: Cast): Barrage {
  const { spell } = cast;
  const perAction = shardsPerAction(spell.rank);
  return {
    actor: spell.actor,
    name: spell.name,
    img: spell.img,
    rank: spell.rank,
    perAction,
    pending: false,
    ongoing: false,
    opening: true,
    targets: prefill(spell.actor, perAction),
    fire: (volley, event) => fireVolley(readCast(message), volley, event),
    save: async () => {},
  };
}

/** `fired` lists the tokens the cast's own volley already hit; omit it when that volley is still owed. */
export async function grantShardstorm(
  cast: Cast,
  wand: ConsumablePF2e<ActorPF2e>,
  fired?: string[],
): Promise<void> {
  const { spell } = cast;
  const actor = spell.actor;

  // Activating the wand again ends the shards of the earlier activation.
  const previous = actor.itemTypes.effect.filter((effect) => shardstormFlag(effect)).map((effect) => effect.id);
  if (previous.length) await actor.deleteEmbeddedDocuments('Item', previous);

  const perAction = shardsPerAction(spell.rank);
  const counts = distribute(perAction, fired?.length ?? 0);
  const flag: ShardstormFlag = {
    user: game.user.id,
    wand: wand.id,
    entry: cast.entry,
    rank: spell.rank,
    opening: !fired,
    firedRound: fired ? currentRound() : null,
    targets: fired?.map((token, index) => ({ token, shards: counts[index] })) ?? prefill(actor, perAction),
  };
  const description = localize('effect.description', { wand: `@UUID[${wand.uuid}]`, shards: perAction });
  await actor.createEmbeddedDocuments('Item', [
    {
      type: 'effect',
      name: localize('effect.name'),
      img: wand.img,
      system: {
        description: { value: `<p>${description}</p>` },
        duration: { value: DURATION_ROUNDS, unit: 'rounds', expiry: 'turn-start', sustained: false },
        level: { value: wand.level },
        tokenIcon: { show: true },
      },
      flags: { [MODULE_ID]: { [FLAG]: flag } },
    },
  ]);
}

/**
 * The wand's window shows on the caster's turn in a round that has had no volley yet. The cast
 * counts as its round's volley, so the window first shows in the round after the cast.
 */
export function isDue(effect: ShardstormEffect, flag: ShardstormFlag): boolean {
  if (flag.opening) return true;
  const round = currentRound();
  return round !== null && round !== flag.firedRound && game.combat?.combatant?.actor === effect.actor;
}

function wandCast(effect: ShardstormEffect): Cast | null {
  const flag = shardstormFlag(effect);
  const wand = flag ? effect.actor.items.get(flag.wand) : undefined;
  const spell = wand?.isOfType('consumable') ? wand.embeddedSpell : null;
  return flag && spell ? { spell, entry: flag.entry } : null;
}

export function wandBarrage(effect: ShardstormEffect, flag: ShardstormFlag): Barrage {
  return {
    actor: effect.actor,
    name: effect.name,
    img: effect.img,
    rank: flag.rank,
    perAction: shardsPerAction(flag.rank),
    pending: false,
    ongoing: true,
    opening: flag.opening,
    targets: flag.targets.filter((target) => tokenOf(target.token)),
    fire: (volley, event) => fireVolley(wandCast(effect), volley, event),
    save: async (targets) => {
      const state = { opening: false, firedRound: currentRound(), targets };
      await effect.update({ flags: { [MODULE_ID]: { [FLAG]: state } } });
    },
  };
}

async function fireVolley(cast: Cast | null, volley: Assignment[], event: PointerEvent): Promise<boolean> {
  if (!cast) {
    ui.notifications.warn(localize('warn.noSource'));
    return false;
  }
  for (const { token, shards } of volley) {
    const target = tokenOf(token);
    if (shards < 1 || !target?.actor) continue;
    if (!(await fireAt(cast, target, target.actor, shards, event))) return false;
  }
  return true;
}

function targetLine(token: TokenDocumentPF2e, shards: number): string {
  const text = localize('chatTarget', { name: foundry.utils.escapeHTML(token.name), shards });
  const visibility = token.playersCanSeeName ? '' : ' data-visibility="gm"';
  return `<div class="target-dc-result"><div class="target-dc"><span${visibility}>${text}</span></div></div>`;
}

async function fireAt(
  cast: Cast,
  target: TokenDocumentPF2e,
  targetActor: ActorPF2e,
  shards: number,
  event: PointerEvent,
): Promise<boolean> {
  const { spell } = cast;

  // Shards at one target combine into a single roll before modifiers and resistances apply.
  const damage = Object.fromEntries(
    Object.entries(spell._source.system.damage).map(([id, partial]) => [
      id,
      { formula: new foundry.dice.Roll(partial.formula).alter(shards, 0, { multiplyNumeric: true }).formula },
    ]),
  );
  // Clearing the location makes loadVariant build a prepared private copy, so the scaled
  // damage never reaches the spell the sheet and the chat card share.
  const scaled = spell.clone({ system: { damage, location: { value: null } } }, { keepId: true });
  const volley = scaled.loadVariant({ entryId: cast.entry, castRank: spell.rank }) ?? scaled;

  // Force barrage has no attack roll, so the system leaves its damage message without a target.
  const stamp = Hooks.on('preCreateChatMessage', (message: ChatMessagePF2e) => {
    const { context, origin } = message.flags.pf2e;
    if (context?.type !== 'damage-roll' || origin?.uuid !== volley.uuid) return;
    message.updateSource({
      flavor: `${message.flavor}${targetLine(target, shards)}`,
      flags: {
        pf2e: { context: { target: { actor: targetActor.uuid, token: target.uuid } } },
        'pf2e-toolbelt': { targetHelper: { targets: [target.uuid] } },
      },
    });
  });
  try {
    return !!(await volley.rollDamage(event));
  } finally {
    Hooks.off('preCreateChatMessage', stamp);
  }
}
