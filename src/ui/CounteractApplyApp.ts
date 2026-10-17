import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import type { StageStep } from '@/counteract/rules';
import CounteractApply from './components/counteract/CounteractApply.svelte';
import { SvelteWindow } from './SvelteWindow';

export interface EffectChoice {
  uuid: string;
  name: string;
  img: string;
  /** An effect whose origin is the spell, or a condition its description names; either starts checked. */
  match: 'origin' | 'named' | null;
  step: StageStep;
}

export interface HolderChoice {
  key: string;
  name: string;
  img: string;
  effects: EffectChoice[];
}

export interface ApplyChoice {
  spell: string;
  matched: boolean;
  /** The targets held no candidate, so the viewed scene's tokens are listed too. */
  widened: boolean;
  holders: HolderChoice[];
}

type Resolve = (uuids: string[] | null) => void;

/** The GM picks which effects a counteracted spell card ends; closing picks none. */
export class CounteractApplyApp extends SvelteWindow {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-counteract-apply-{id}`,
    classes: [MODULE_ID, `${MODULE_ID}-counteract`],
  };

  readonly choice: ApplyChoice;
  #resolve: Resolve | null;

  constructor(choice: ApplyChoice, resolve: Resolve) {
    super();
    this.choice = choice;
    this.#resolve = resolve;
  }

  static choose(choice: ApplyChoice): Promise<string[] | null> {
    return new Promise((resolve) => {
      const app = new CounteractApplyApp(choice, resolve);
      void app.render({ force: true }).then(() => app.placeCentered());
    });
  }

  confirm(uuids: string[]): Promise<this> {
    this.#settle(uuids);
    return this.close();
  }

  #settle(uuids: string[] | null): void {
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(uuids);
  }

  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    this.#settle(null);
    return super.close(options);
  }

  protected mountBody(target: HTMLElement): ReturnType<typeof mount> {
    return mount(CounteractApply, { target, props: { app: this } });
  }
}
