import { MODULE_ID } from './constants';

export const AWARD_XP_ON_COMBAT_END = 'awardXpOnCombatEnd';
export const SELL_PERCENT = 'sellPercent';

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
    game.settings.register(MODULE_ID, SELL_PERCENT, {
      name: `${MODULE_ID}.settings.${SELL_PERCENT}.name`,
      hint: `${MODULE_ID}.settings.${SELL_PERCENT}.hint`,
      scope: 'world',
      config: true,
      type: new foundry.data.fields.NumberField({ required: true, nullable: false, min: 0, max: 100, step: 5 }),
      default: 50,
    });
  });
}

export function awardXpOnCombatEnd(): boolean {
  return game.settings.get(MODULE_ID, AWARD_XP_ON_COMBAT_END) === true;
}

export function sellPercent(): number {
  const value = Number(game.settings.get(MODULE_ID, SELL_PERCENT));
  return Number.isFinite(value) ? value : 50;
}
