export interface SaleCoins {
  gp: number;
  sp: number;
  cp: number;
}

/** Treasure (gems, art objects) sells at full value under the PF2e rules; other goods sell at the set percentage. */
export function salePercent(isTreasure: boolean, setting: number): number {
  return isTreasure ? 100 : Math.min(100, Math.max(0, setting));
}

export function saleCopper(stackCopper: number, stackQuantity: number, count: number, percent: number): number {
  if (stackQuantity <= 0 || count <= 0) return 0;
  return Math.floor((stackCopper * count * percent) / (stackQuantity * 100));
}

export function copperToCoins(copper: number): SaleCoins {
  const total = Math.max(0, Math.floor(copper));
  return { gp: Math.floor(total / 100), sp: Math.floor((total % 100) / 10), cp: total % 10 };
}

export function isSaleCount(count: unknown, max: number): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= max;
}

export function isSalePercent(percent: unknown): percent is number {
  return typeof percent === 'number' && Number.isFinite(percent) && percent >= 0;
}

export function clampCount(count: number, max: number): number {
  return Math.min(max, Math.max(1, Math.round(count)));
}
