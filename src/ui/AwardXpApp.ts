import type { CharacterPF2e } from 'foundry-pf2e';
import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import { awardXp } from '@/xp/xp';
import AwardXp from './components/xp/AwardXp.svelte';
import { SvelteWindow } from './SvelteWindow';

/** PF2e's award for the encounter that just ended. */
export interface AwardSuggestion {
  xp: number;
  threat: string;
}

export class AwardXpApp extends SvelteWindow {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-award-xp`,
    classes: [MODULE_ID, `${MODULE_ID}-xp`],
  };

  static #current?: AwardXpApp;

  readonly members: CharacterPF2e[];
  readonly suggestion: AwardSuggestion | undefined;

  constructor(members: CharacterPF2e[], suggestion?: AwardSuggestion) {
    super();
    this.members = members;
    this.suggestion = suggestion;
  }

  static async open(members: CharacterPF2e[], suggestion?: AwardSuggestion): Promise<AwardXpApp> {
    await AwardXpApp.#current?.close();
    const app = new AwardXpApp(members, suggestion);
    AwardXpApp.#current = app;
    await app.render({ force: true });
    app.placeCentered();
    return app;
  }

  async award(amount: number): Promise<void> {
    await this.close();
    await awardXp(amount, this.members);
  }

  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    if (AwardXpApp.#current === this) AwardXpApp.#current = undefined;
    return super.close(options);
  }

  protected mountBody(target: HTMLElement): ReturnType<typeof mount> {
    return mount(AwardXp, { target, props: { app: this } });
  }
}
