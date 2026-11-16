import type { ActorPF2e, PhysicalItemPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import { sellPercent } from '@/settings';
import { localize, sell, type SellMode } from './sell';

const BUTTON_CLASS = `${MODULE_ID}-sell-button`;
const ANCHOR_ACTIONS = ['toggle-identified', 'edit-item', 'delete-item'];
const IS_MAC = /Mac/i.test(navigator.userAgent);

function sellable(item: PhysicalItemPF2e | undefined): item is PhysicalItemPF2e {
  if (!item?.isOfType('physical')) return false;
  if (item.isOfType('treasure') && item.isCurrency) return false;
  // An unidentified item's price is GM-only, and a sale would reveal it.
  return game.user.isGM || item.isIdentified;
}

function sellButton(item: PhysicalItemPF2e): HTMLAnchorElement {
  const button = document.createElement('a');
  button.className = BUTTON_CLASS;
  const percent = item.isOfType('treasure') ? 100 : sellPercent();
  button.dataset.tooltipHtml = ['click', 'shiftClick', IS_MAC ? 'optionClick' : 'altClick']
    .map((line) => foundry.utils.escapeHTML(localize(`tooltip.${line}`, { percent })))
    .join('<br>');
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', localize('label', { name: item.name }));
  button.innerHTML = '<i class="fa-solid fa-coins fa-fw" inert></i>';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const mode: SellMode = event.altKey ? 'all' : event.shiftKey ? 'price' : 'default';
    void sell(item, mode);
  });
  return button;
}

/** PF2e's party sheet is an appv1 ActorSheet, whose render hook passes jQuery. */
function onRenderPartySheet(sheet: { actor: ActorPF2e }, html: HTMLElement | ArrayLike<HTMLElement>): void {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  const party = sheet.actor;
  const rows = root.querySelectorAll<HTMLElement>('.tab.inventory .inventory-list li[data-item-id]');
  for (const row of rows) {
    const controls = row.querySelector<HTMLElement>(':scope > .data > .item-controls:not(.readonly)');
    if (!controls || controls.querySelector(`.${BUTTON_CLASS}`)) continue;
    const item = party.items.get(row.dataset.itemId ?? '') as PhysicalItemPF2e | undefined;
    if (!sellable(item)) continue;
    // Ours replaces PF2e's treasure-only sell, which sits in a different spot and always asks to confirm.
    controls.querySelector('[data-action="sell-treasure"]')?.remove();
    const anchor = ANCHOR_ACTIONS.map((action) => controls.querySelector(`[data-action="${action}"]`)).find(Boolean);
    controls.insertBefore(sellButton(item), anchor ?? null);
  }
}

export function registerSell(): void {
  Hooks.on('renderPartySheetPF2e', onRenderPartySheet);
}
