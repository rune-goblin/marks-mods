import type { ChatMessagePF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { FLAG } from './counteract';
import { asDegree, readCounteractFlag, rerolledFlag, type CounteractFlag } from './rules';

// PF2e's Check.rerollFromMessage fires `pf2e.reroll`, deletes the old message, then creates its
// replacement with only `pf2e` flags, all on the rerolling client. The hook names no message, so
// the deletion that follows it identifies the message and the next reroll creation receives its flag.
let rerolling = false;
let carried: CounteractFlag | null = null;

function onReroll(): void {
  rerolling = true;
  carried = null;
}

function onPreDelete(message: ChatMessagePF2e): void {
  if (!rerolling) return;
  rerolling = false;
  carried = readCounteractFlag(message.flags[MODULE_ID]?.[FLAG]);
}

function isReroll(message: ChatMessagePF2e): boolean {
  const context = message.flags.pf2e.context;
  return !!context && 'isReroll' in context && context.isReroll === true;
}

// Writing into the pending creation keeps the flag write on the client that owns the new message.
function onPreCreate(message: ChatMessagePF2e): void {
  if (!carried || !isReroll(message)) return;
  const flag = carried;
  carried = null;
  const roll = message.rolls[0] as { degreeOfSuccess?: unknown } | undefined;
  const rerolled = rerolledFlag(flag, asDegree(roll?.degreeOfSuccess));
  message.updateSource({ flags: { [MODULE_ID]: { [FLAG]: rerolled } } });
}

export function registerReroll(): void {
  Hooks.on('pf2e.reroll', onReroll);
  Hooks.on('preDeleteChatMessage', onPreDelete);
  Hooks.on('preCreateChatMessage', onPreCreate);
}
