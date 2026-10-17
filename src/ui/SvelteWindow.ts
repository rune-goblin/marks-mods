import { mount, unmount } from 'svelte';

const { ApplicationV2 } = foundry.applications.api;

/** A frameless window: its Svelte component draws the title bar and drags the window itself. */
export abstract class SvelteWindow extends ApplicationV2 {
  static override DEFAULT_OPTIONS: DeepPartial<foundry.applications.ApplicationConfiguration> = {
    tag: 'section',
    window: { frame: false, positioned: true },
    position: { width: 'auto', height: 'auto' },
  };

  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;

  protected abstract mountBody(target: HTMLElement): ReturnType<typeof mount>;

  /** Centres the window, nudged down and right by `offset` steps so stacked windows stay visible. */
  protected placeCentered(offset = 0): void {
    const { width, height } = this.element.getBoundingClientRect();
    const nudge = offset * 24;
    this.setPosition({
      left: (window.innerWidth - width) / 2 + nudge,
      top: (window.innerHeight - height) / 2 + nudge,
    });
  }

  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    return super.close({ ...options, animate: false }) as Promise<this>;
  }

  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#root = document.createElement('div');
      this.#component = this.mountBody(this.#root);
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
