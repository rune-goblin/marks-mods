import { MODULE_ID } from './constants';

export const AWARD_XP_ON_COMBAT_END = 'awardXpOnCombatEnd';

export function registerSettings(): void {
  Hooks.once('init', () => {
    game.settings.register(MODULE_ID, AWARD_XP_ON_COMBAT_END, {
      name: `${MODULE_ID}.settings.${AWARD_XP_ON_COMBAT_END}.name`,
      hint: `${MODULE_ID}.settings.${AWARD_XP_ON_COMBAT_END}.hint`,
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  });
}

export function awardXpOnCombatEnd(): boolean {
  return game.settings.get(MODULE_ID, AWARD_XP_ON_COMBAT_END) === true;
}
