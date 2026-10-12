import { mount, unmount } from 'svelte';
import type { Barrage } from '@/barrage/barrage';
import { MODULE_ID } from '@/constants';
import BarrageWindow from './components/barrage/Barrage.svelte';

const { ApplicationV2 } = foundry.applications.api;

export class BarrageApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-barrage-{id}`,
    tag: 'section',
    classes: [MODULE_ID, `${MODULE_ID}-barrage`],
    // Frameless: the component draws its own title bar and drags the window itself.
    window: { frame: false, positioned: true },
    position: { width: 'auto' as const, height: 'auto' as const },
  };

  readonly barrage: Barrage;
  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;
  #released = false;

  constructor(barrage: Barrage) {
    super();
    this.barrage = barrage;
  }

  static open(barrage: Barrage): BarrageApp {
    const app = new BarrageApp(barrage);
    void app.render({ force: true }).then(() => app.#placeInitial());
    return app;
  }

  #placeInitial(): void {
    const { width, height } = this.element.getBoundingClientRect();
    this.setPosition({ left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2 });
  }

  async release(): Promise<void> {
    this.#released = true;
    await this.close();
  }

  // A wand's window lives exactly as long as its effect, so only release() closes it.
  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    if (this.barrage.ongoing && !this.#released) return Promise.resolve(this);
    return super.close({ ...options, animate: false }) as Promise<this>;
  }

  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#root = document.createElement('div');
      this.#component = mount(BarrageWindow, { target: this.#root, props: { app: this, barrage: this.barrage } });
    }
    return this.#root!;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected override async _preClose(): Promise<void> {
    if (this.#component) {
      unmount(this.#component);
      this.#component = undefined;
      this.#root = undefined;
    }
  }
}
