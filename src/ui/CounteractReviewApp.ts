import { mount } from 'svelte';
import { MODULE_ID } from '@/constants';
import { suggestTarget, type Approval, type CounteractRequest, type TargetSuggestion } from '@/counteract/counteract';
import CounteractReview from './components/counteract/CounteractReview.svelte';
import { SvelteWindow } from './SvelteWindow';

type Respond = (approval: Approval | null) => void;

export class CounteractReviewApp extends SvelteWindow {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-counteract-review-{id}`,
    classes: [MODULE_ID, `${MODULE_ID}-counteract`],
  };

  static #reviews = new Map<string, CounteractReviewApp>();

  readonly request: CounteractRequest;
  readonly suggestion: TargetSuggestion;
  #respond: Respond | null;

  constructor(request: CounteractRequest, respond: Respond) {
    super();
    this.request = request;
    this.suggestion = suggestTarget(request.cardId);
    this.#respond = respond;
  }

  static open(request: CounteractRequest, respond: Respond): CounteractReviewApp {
    const app = new CounteractReviewApp(request, respond);
    CounteractReviewApp.#reviews.set(request.requestId, app);
    const offset = CounteractReviewApp.#reviews.size - 1;
    void app.render({ force: true }).then(() => app.placeCentered(offset));
    return app;
  }

  /** The requester withdrew: close without answering. */
  static dismiss(requestId: string, userId: string): void {
    const app = CounteractReviewApp.#reviews.get(requestId);
    if (!app || app.request.userId !== userId) return;
    app.#respond = null;
    void app.close();
  }

  approve(approval: Approval): Promise<this> {
    this.#answer(approval);
    return this.close();
  }

  #answer(approval: Approval | null): void {
    const respond = this.#respond;
    this.#respond = null;
    respond?.(approval);
  }

  /** Closing an unanswered review refuses it, so the requester never waits on a vanished window. */
  override close(options?: foundry.applications.ApplicationClosingOptions): Promise<this> {
    this.#answer(null);
    CounteractReviewApp.#reviews.delete(this.request.requestId);
    return super.close(options);
  }

  protected mountBody(target: HTMLElement): ReturnType<typeof mount> {
    return mount(CounteractReview, { target, props: { app: this } });
  }
}
