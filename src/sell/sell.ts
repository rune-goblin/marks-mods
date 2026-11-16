import type { PhysicalItemPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { sellPercent } from '@/settings';
import { SellApp } from '@/ui/SellApp';
import { copperToCoins, saleCopper, salePercent } from './rules';

export function localize(key: string, data?: Record<string, string | number>): string {
  const path = `${MODULE_ID}.sell.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

export function formatCopper(copper: number): string {
  return new game.pf2e.Coins({ cp: copper }).toString();
}

export interface Sale {
  actorUuid: string;
  itemId: string;
  name: string;
  img: string;
  quantity: number;
  stackCopper: number;
  percent: number;
  askCount: boolean;
  askPrice: boolean;
}

export function saleFor(item: PhysicalItemPF2e, askPrice: boolean): Sale | null {
  if (!item.actor) return null;
  return {
    actorUuid: item.actor.uuid,
    itemId: item.id,
    name: item.name,
    img: item.img,
    quantity: item.quantity,
    stackCopper: item.assetValue.copperValue,
    percent: salePercent(item.isOfType('treasure'), sellPercent()),
    askCount: item.quantity > 1,
    askPrice,
  };
}

export async function completeSale(sale: Sale, count: number, copper: number): Promise<void> {
  const actor = fromUuidSync(sale.actorUuid) as PhysicalItemPF2e['actor'];
  const item = actor?.items.get(sale.itemId) as PhysicalItemPF2e | undefined;
  if (!actor || !item) {
    ui.notifications.warn(localize('warn.gone', { name: sale.name }));
    return;
  }
  const sold = Math.min(count, item.quantity);
  if (sold >= item.quantity) await item.delete();
  else await item.update({ 'system.quantity': item.quantity - sold });
  if (copper > 0) await actor.inventory.addCurrency(copperToCoins(copper));
  ui.notifications.info(localize('sold', { count: sold, name: sale.name, value: formatCopper(copper) }));
}

export type SellMode = 'default' | 'price' | 'all';

export async function sell(item: PhysicalItemPF2e, mode: SellMode): Promise<void> {
  const sale = saleFor(item, mode === 'price');
  if (!sale) return;
  if (mode !== 'all' && (sale.askCount || sale.askPrice)) {
    await SellApp.open(sale);
    return;
  }
  const count = mode === 'all' ? sale.quantity : 1;
  const copper = saleCopper(sale.stackCopper, sale.quantity, count, sale.percent);
  if (copper <= 0) {
    ui.notifications.warn(localize('warn.noValue', { name: sale.name }));
    return;
  }
  await completeSale(sale, count, copper);
}
