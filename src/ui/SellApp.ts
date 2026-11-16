import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import { completeSale, type Sale } from '@/sell/sell';
import Sell from './components/sell/Sell.svelte';
import { SvelteWindow } from './SvelteWindow';

export class SellApp extends SvelteWindow {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-sell`,
    classes: [MODULE_ID, `${MODULE_ID}-sell`],
  };

  static #current?: SellApp;

  readonly sale: Sale;

  constructor(sale: Sale) {
    super();
    this.sale = sale;
  }

  static async open(sale: Sale): Promise<SellApp> {
    await SellApp.#current?.close();
    const app = new SellApp(sale);
    SellApp.#current = app;
    await app.render({ force: true });
    app.placeCentered();
    return app;
  }

  async confirm(count: number, copper: number): Promise<void> {
    await this.close();
    await completeSale(this.sale, count, copper);
  }

  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    if (SellApp.#current === this) SellApp.#current = undefined;
    return super.close(options);
  }

  protected mountBody(target: HTMLElement): ReturnType<typeof mount> {
    return mount(Sell, { target, props: { app: this } });
  }
}
