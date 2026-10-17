import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import type { PickerSession } from '@/counteract/counteract';
import type { PendingRequest } from '@/counteract/socket';
import Counteract from './components/counteract/Counteract.svelte';
import { SvelteWindow } from './SvelteWindow';

export class CounteractApp extends SvelteWindow {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-counteract-{id}`,
    classes: [MODULE_ID, `${MODULE_ID}-counteract`],
  };

  static #current?: CounteractApp;

  readonly session: PickerSession;
  /** A player's request awaiting the GM; closing the picker withdraws it. */
  pending: PendingRequest | null = null;

  constructor(session: PickerSession) {
    super();
    this.session = session;
  }

  static async open(session: PickerSession): Promise<CounteractApp> {
    await CounteractApp.#current?.close();
    const app = new CounteractApp(session);
    CounteractApp.#current = app;
    await app.render({ force: true });
    app.placeCentered();
    return app;
  }

  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    if (CounteractApp.#current === this) CounteractApp.#current = undefined;
    this.pending?.cancel();
    this.pending = null;
    return super.close(options);
  }

  protected mountBody(target: HTMLElement): ReturnType<typeof mount> {
    return mount(Counteract, { target, props: { app: this, session: this.session } });
  }
}
