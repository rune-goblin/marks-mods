import type { ActorPF2e, ChatMessagePF2e, EffectPF2e, TokenDocumentPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import {
  AMPED_TAG,
  TARGET_EFFECT,
  TARGET_EFFECT_SLUG,
  isAmped,
  readCast,
  spendsGlimpse,
  type GlimpseCast,
} from './rules';

const FLAG = 'glimpse';

interface GlimpseFlag {
  target: string;
  amped: boolean;
}

function warn(key: string): void {
  ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.glimpse.warn.${key}`));
}

function targetedCreature(caster: string): string | null {
  const tokens = [...game.user.targets].map((token) => token.document);
  return tokens.find((token) => token.actor?.isOfType('creature') && token.actor.uuid !== caster)?.uuid ?? null;
}

async function endGlimpse(actor: ActorPF2e): Promise<void> {
  const effects = actor.itemTypes.effect.filter((effect) => effect.slug === TARGET_EFFECT_SLUG);
  if (effects.length) {
    await actor.deleteEmbeddedDocuments(
      'Item',
      effects.map((effect) => effect.id),
    );
  }
}

async function applyGlimpse(
  message: ChatMessagePF2e,
  cast: GlimpseCast,
  { target, amped }: GlimpseFlag,
): Promise<void> {
  const token = fromUuidSync<TokenDocumentPF2e>(target);
  const actor = token?.actor;
  if (!token || !actor) return;
  const effect = await fromUuid<EffectPF2e>(TARGET_EFFECT);
  if (!effect) {
    warn('noEffect');
    return;
  }

  // A second cast on the same creature replaces the first: the spell does not stack with itself.
  await endGlimpse(actor);
  const source = foundry.utils.mergeObject(effect.toObject(), {
    _id: null,
    system: {
      level: { value: cast.rank },
      traits: { otherTags: amped ? [AMPED_TAG] : [] },
      context: {
        origin: {
          actor: cast.caster,
          token: message.token?.uuid ?? null,
          item: cast.spell,
          spellcasting: null,
          rollOptions: cast.rollOptions,
        },
        target: { actor: actor.uuid, token: token.uuid },
        roll: null,
      },
    },
  });
  await actor.createEmbeddedDocuments('Item', [source]);
}

/** The caster's client records what only the moment of casting knows: its target and the amp toggles. */
function onPreCreate(message: ChatMessagePF2e): void {
  const cast = readCast(message.flags.pf2e);
  if (!cast) return;
  const target = targetedCreature(cast.caster);
  if (!target) {
    warn('noTarget');
    return;
  }
  const flag: GlimpseFlag = { target, amped: isAmped(cast, message.actor?.rollOptions.all) };
  message.updateSource({ flags: { [MODULE_ID]: { [FLAG]: flag } } });
}

function onCreate(message: ChatMessagePF2e): void {
  // A player cannot edit the creature they target, so the active GM's client writes for everyone.
  if (!game.users.activeGM?.isSelf) return;
  const flags = message.flags.pf2e;
  const flag = message.flags[MODULE_ID]?.[FLAG] as GlimpseFlag | undefined;
  const cast = flag ? readCast(flags) : null;
  if (cast && flag) void applyGlimpse(message, cast, flag);
  else if (spendsGlimpse(flags) && message.target) void endGlimpse(message.target.actor);
}

export function registerGlimpse(): void {
  Hooks.on('preCreateChatMessage', onPreCreate);
  Hooks.on('createChatMessage', onCreate);
}
