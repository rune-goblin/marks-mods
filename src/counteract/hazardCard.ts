import type { ActorPF2e, HazardPF2e } from 'foundry-pf2e';
import { MODULE_ID } from '@/constants';
import type { ContextMenuEntry } from '@/ui/contextMenu';
import { STORED_TARGET_FLAG, localize } from './counteract';
import { hazardCounteract, type StoredTarget } from './rules';

const DISABLE_FIELD = 'system.details.disable';
const MARKER = `data-${MODULE_ID}-disable`;

function disableSection(root: HTMLElement): HTMLElement | null {
  const editor = root.querySelector(`[data-edit="${DISABLE_FIELD}"]`);
  if (editor) return editor.closest<HTMLElement>('.section-container');
  // A sheet that isn't editable renders the editor without `data-edit`.
  const label = game.i18n.localize('PF2E.HazardDisableLabel');
  const headers = root.querySelectorAll<HTMLElement>('.section-container > .section-header h4');
  return [...headers].find((header) => header.textContent?.trim() === label)?.closest('.section-container') ?? null;
}

async function postCounteractCard(hazard: HazardPF2e): Promise<void> {
  const { rank, dc } = hazardCounteract({ disable: hazard.system.details.disable, level: hazard.level });
  // Visibility blocks stay unprocessed so each viewer's client filters them when the card renders.
  const enrichOptions = { rollData: hazard.getRollData(), relativeTo: hazard, processVisibility: false };
  const disable = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    hazard.system.details.disable,
    enrichOptions,
  );
  const name = foundry.utils.escapeHTML(hazard.name);
  const content = `
    <div class="pf2e chat-card ${MODULE_ID} ${MODULE_ID}-counteract-card">
      <header class="card-header flexrow">
        <img src="${foundry.utils.escapeHTML(hazard.img)}" alt="" />
        <h3>${name}</h3>
      </header>
      <div class="card-content">
        <p class="prompt"><i class="fa-solid fa-shield-halved"></i> ${localize('card.prompt', { name })}</p>
        <p class="hint">${localize('card.hint')}</p>
        <section class="gm-details" data-visibility="gm">
          <p class="values">
            <span>${localize('card.rank', { rank })}</span>
            <span>${localize('card.dc', { dc })}</span>
          </p>
          <div class="disable">${disable}</div>
        </section>
      </div>
    </div>`;
  const token = hazard.getActiveTokens(false, true)[0] ?? null;
  const flag: StoredTarget = { rank, dc };
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: hazard, token }),
    content,
    flags: { [MODULE_ID]: { [STORED_TARGET_FLAG]: flag } },
  });
}

/** PF2e's hazard sheet is an appv1 ActorSheet, whose render hook passes jQuery. */
function onRenderHazardSheet(sheet: { actor: ActorPF2e }, html: HTMLElement | ArrayLike<HTMLElement>): void {
  const hazard = sheet.actor;
  if (!game.user.isGM || !hazard.isOfType('hazard')) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const section = root ? disableSection(root) : null;
  if (!section) return;
  section.setAttribute(MARKER, '');

  const entries: ContextMenuEntry[] = [
    {
      label: `${MODULE_ID}.counteract.card.post`,
      icon: 'fa-solid fa-shield-halved',
      onClick: () => void postCounteractCard(hazard),
    },
  ];
  // An open editor keeps the browser's own menu, for spellcheck and paste.
  const selector = `[${MARKER}]:not(:has(.editor.prosemirror))`;
  new foundry.applications.ux.ContextMenu(
    section,
    selector,
    entries as unknown as ConstructorParameters<typeof foundry.applications.ux.ContextMenu>[2],
    { jQuery: false, fixed: true },
  );
}

export function registerHazardCard(): void {
  Hooks.on('renderHazardSheetPF2e', onRenderHazardSheet);
}
