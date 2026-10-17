import type { ChatMessagePF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { FLAG } from './counteract';
import {
  asDegree,
  readCounteractFlag,
  rerollCreating,
  rerollDeleting,
  rerollStarted,
  rerolledFlag,
  rollKey,
  type CounteractFlag,
  type RerollTrack,
} from './rules';

// PF2e's Check.rerollFromMessage fires `pf2e.reroll`, deletes the old message, then creates its
// replacement with only `pf2e` flags, all on the rerolling client. The hook names no message and
// PF2e can still bail out after it, so the old message is found by its roll, not by what comes next.
let track: RerollTrack<CounteractFlag> = { pending: null, carried: null };

function notesOf(message: ChatMessagePF2e): string {
  const context = message.flags.pf2e.context;
  return JSON.stringify((context && 'notes' in context ? context.notes : null) ?? null);
}

function isReroll(message: ChatMessagePF2e): boolean {
  const context = message.flags.pf2e.context;
  return !!context && 'isReroll' in context && context.isReroll === true;
}

function onReroll(oldRoll: Roll): void {
  track = rerollStarted(rollKey(oldRoll.toJSON()));
}

function onPreDelete(message: ChatMessagePF2e): void {
  if (!track.pending) return;
  const roll = message.rolls[0];
  track = rerollDeleting(track, {
    rollKey: roll ? rollKey(roll.toJSON()) : null,
    flag: readCounteractFlag(message.flags[MODULE_ID]?.[FLAG]),
    notes: notesOf(message),
  });
}

// Writing into the pending creation keeps the flag write on the client that owns the new message.
function onPreCreate(message: ChatMessagePF2e): void {
  if (!isReroll(message)) return;
  const created = rerollCreating(track, { notes: notesOf(message) });
  track = created.track;
  if (!created.flag) return;
  const roll = message.rolls[0] as { degreeOfSuccess?: unknown } | undefined;
  const rerolled = rerolledFlag(created.flag, asDegree(roll?.degreeOfSuccess));
  message.updateSource({ flags: { [MODULE_ID]: { [FLAG]: rerolled } } });
}

export function registerReroll(): void {
  Hooks.on('pf2e.reroll', onReroll);
  Hooks.on('preDeleteChatMessage', onPreDelete);
  Hooks.on('preCreateChatMessage', onPreCreate);
}
