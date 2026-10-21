import type { EncounterPF2e } from 'foundry-pf2e';
import { awardXpOnCombatEnd } from '@/settings';
import { AwardXpApp, type AwardSuggestion } from '@/ui/AwardXpApp';
import { awardXp, localize, partyCharacters, registerSocket, sparklePCs } from './xp';

export function openAwardXp(suggestion?: AwardSuggestion): void {
  if (!game.user.isGM) {
    ui.notifications.error(localize('warn.gmOnly'));
    return;
  }
  const members = partyCharacters();
  if (members) void AwardXpApp.open(members, suggestion);
}

/** Opens the award window for the GM who ended a fight, preset to PF2e's XP for that encounter. */
function onCombatEnd(combat: EncounterPF2e, _options: unknown, userId: string): void {
  if (userId !== game.user.id || !game.user.isGM || !combat.started || !awardXpOnCombatEnd()) return;
  const metrics = combat.metrics;
  openAwardXp(metrics && metrics.award.xp > 0 ? { xp: metrics.award.xp, threat: metrics.threat } : undefined);
}

export function registerXp(): void {
  registerSocket();
  Hooks.on('deleteCombat', onCombatEnd);
}

export { awardXp, sparklePCs };
