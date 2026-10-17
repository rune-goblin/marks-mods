import type { ChatMessagePF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { CounteractApp } from '@/ui/CounteractApp';
import type { ContextMenuEntry } from '@/ui/contextMenu';
import { cardTargetName, readCard, rollerActor, skillRank, skillSources, spellSources, warn } from './counteract';
import { registerHazardCard } from './hazardCard';
import { registerSocket } from './socket';

function messageOf(li: HTMLElement): ChatMessagePF2e | undefined {
  return game.messages.get(li.dataset.messageId ?? '');
}

async function openPicker(message: ChatMessagePF2e): Promise<void> {
  const card = readCard(message);
  if (!card) return;
  const actor = rollerActor();
  if (!actor) {
    warn('noActor');
    return;
  }
  const spells = await spellSources(actor);
  const skills = skillSources(actor);
  if (!spells.length && !skills.length) {
    warn('noSources', { name: actor.name });
    return;
  }
  await CounteractApp.open({
    actor,
    cardId: message.id,
    card,
    targetName: cardTargetName(message, card),
    skillRank: skillRank(actor),
    spells,
    skills,
  });
}

export function registerCounteract(): void {
  registerSocket();
  registerHazardCard();
  Hooks.on('getChatMessageContextOptions', (_app: unknown, options: ContextMenuEntry[]) => {
    options.push({
      label: `${MODULE_ID}.counteract.menu`,
      icon: 'fa-solid fa-shield-halved',
      visible: (li) => {
        const message = messageOf(li);
        return !!message && !!readCard(message);
      },
      onClick: (_event, li) => {
        const message = messageOf(li);
        if (message) void openPicker(message);
      },
    });
  });
}
