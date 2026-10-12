import type { ActorPF2e, ChatMessagePF2e, ItemPF2e } from 'foundry-pf2e';
import { BarrageApp } from '@/ui/BarrageApp';
import {
  castBarrage,
  claimCast,
  grantShardstorm,
  installCastPatch,
  isDue,
  readCast,
  shardstormFlag,
  wandBarrage,
  type ShardstormEffect,
} from './barrage';

const wandWindows = new Map<string, BarrageApp>();

function dueEffects(): ShardstormEffect[] {
  const actors = new Set<ActorPF2e>(game.actors);
  for (const token of canvas.scene?.tokens ?? []) {
    if (token.actor) actors.add(token.actor);
  }
  return [...actors].flatMap((actor) =>
    actor.items.filter((item): item is ShardstormEffect => {
      if (!item.isOfType('effect')) return false;
      const flag = shardstormFlag(item);
      return flag?.user === game.user.id && !item.remainingDuration.expired && isDue(item, flag);
    }),
  );
}

function syncWandWindows(): void {
  if (!game.ready) return;
  const due = new Map<string, ShardstormEffect>(dueEffects().map((effect) => [effect.uuid, effect]));
  for (const [uuid, app] of wandWindows) {
    if (due.has(uuid)) continue;
    wandWindows.delete(uuid);
    void app.release();
  }
  for (const [uuid, effect] of due) {
    const flag = shardstormFlag(effect);
    if (flag && !wandWindows.has(uuid)) wandWindows.set(uuid, BarrageApp.open(wandBarrage(effect, flag)));
  }
}

function onCast(message: ChatMessagePF2e): void {
  const cast = readCast(message);
  if (!cast || claimCast(cast)) return;
  if (cast.wand) void grantShardstorm(cast, cast.wand);
  else BarrageApp.open(castBarrage(message, cast));
}

export function registerBarrage(): void {
  Hooks.once('setup', () => installCastPatch((barrage) => BarrageApp.open(barrage)));

  Hooks.on('createChatMessage', (message: ChatMessagePF2e, _options: unknown, userId: string) => {
    if (userId === game.user.id) onCast(message);
  });

  const onItemChange = (item: ItemPF2e): void => {
    if (shardstormFlag(item)) syncWandWindows();
  };
  for (const hook of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(hook, onItemChange);

  // Turn changes decide whether the wand's volley is due, and an expired effect stays on the
  // actor when the system's auto-removal setting is off.
  const turnHooks = ['updateCombat', 'deleteCombat', 'createCombatant', 'deleteCombatant'];
  for (const hook of ['ready', 'canvasReady', 'updateWorldTime', ...turnHooks]) {
    Hooks.on(hook, () => syncWandWindows());
  }
}
