import type { CharacterPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { localize } from './i18n';
import { DEFAULT_SPARKLE_AMOUNT, isAward, nextXp } from './rules';
import { runSparkle } from './sparkle';

export { localize };

const CHANNEL = `module.${MODULE_ID}`;

interface SparkleMessage {
  type: 'xpSparkle';
  actorIds: string[];
  amount: number;
}

/** The primary party's characters, or null after warning why there are none. */
export function partyCharacters(): CharacterPF2e[] | null {
  const party = game.actors.party;
  if (!party) {
    ui.notifications.error(localize('warn.noParty'));
    return null;
  }
  const members = party.members.filter((a): a is CharacterPF2e => a.isOfType('character'));
  if (!members.length) {
    ui.notifications.error(localize('warn.noMembers'));
    return null;
  }
  return members;
}

/** Plays the sparkle on every client; the sender's emit never echoes back, so it plays locally too. */
export function sparklePCs(actorIds: string[], amount = DEFAULT_SPARKLE_AMOUNT): void {
  if (!Array.isArray(actorIds) || !actorIds.length) return;
  const message: SparkleMessage = { type: 'xpSparkle', actorIds, amount };
  game.socket.emit(CHANNEL, message);
  runSparkle(actorIds, amount);
}

export async function awardXp(amount: number, actors: CharacterPF2e[]): Promise<void> {
  if (!game.user.isGM || !isAward(amount) || !actors.length) return;
  await Promise.all(
    actors.map((actor) => actor.update({ 'system.details.xp.value': nextXp(actor.system.details.xp.value, amount) })),
  );

  const names = foundry.utils.escapeHTML(actors.map((a) => a.name).join(', '));
  const xp = Math.abs(amount);
  const [headline, list] = amount > 0 ? ['chat.awarded', 'chat.recipients'] : ['chat.removed', 'chat.affected'];
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: `<p><strong>${localize(headline, { xp })}</strong></p><p>${localize(list, { names })}</p>`,
  });

  if (amount > 0) sparklePCs(actors.map((a) => a.id), amount);
}

function onMessage(message: { type?: string } | null, senderId: string): void {
  if (message?.type !== 'xpSparkle' || !game.users.get(senderId)?.isGM) return;
  const { actorIds, amount } = message as SparkleMessage;
  if (Array.isArray(actorIds)) runSparkle(actorIds, Number.isFinite(amount) ? amount : DEFAULT_SPARKLE_AMOUNT);
}

export function registerSocket(): void {
  Hooks.once('ready', () => {
    game.socket.on(CHANNEL, onMessage);
  });
}
