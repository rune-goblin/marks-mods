<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { localize as t } from '@/counteract/counteract';
  import type { StageStep } from '@/counteract/rules';
  import type { CounteractApplyApp } from '@/ui/CounteractApplyApp';
  import Frame from './Frame.svelte';

  let { app }: { app: CounteractApplyApp } = $props();
  const { spell, matched, widened, holders } = untrack(() => app.choice);
  const chosen = new SvelteSet(
    holders.flatMap((holder) => holder.effects.filter((effect) => effect.match).map((effect) => effect.uuid)),
  );

  function toggle(uuid: string): void {
    if (chosen.has(uuid)) chosen.delete(uuid);
    else chosen.add(uuid);
  }

  function outcome(step: StageStep): string {
    return step.type === 'lower' ? t('apply.stage', { from: step.from, to: step.to }) : t('apply.remove');
  }

  function confirm(): void {
    if (chosen.size) void app.confirm([...chosen]);
  }
</script>

<Frame {app} title={t('apply.title')} closeLabel={t('apply.cancel')} onclose={() => app.close()}>
  <div class="prompt">
    <span>{t('apply.prompt', { spell })}</span>
    {#if !matched}
      <span class="muted">{t('apply.noMatch', { spell })}</span>
    {:else if widened}
      <span class="muted">{t('apply.widened', { spell })}</span>
    {/if}
  </div>

  <div class="holders">
    {#each holders as holder (holder.key)}
      <section>
        <div class="holder">
          <img src={holder.img} alt="" />
          <strong>{holder.name}</strong>
        </div>
        <ul class="rows">
          {#each holder.effects as effect (effect.uuid)}
            {@const checked = chosen.has(effect.uuid)}
            <li>
              <button
                type="button"
                class="row"
                class:checked
                aria-pressed={checked}
                onclick={() => toggle(effect.uuid)}
              >
                <i class={checked ? 'fa-solid fa-square-check' : 'fa-regular fa-square'} inert></i>
                <img src={effect.img} alt="" />
                <span class="label">
                  <span class="name">{effect.name}</span>
                  <span class="detail">{outcome(effect.step)}</span>
                </span>
                {#if effect.match}
                  <span class="match">{t(`apply.${effect.match}`)}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <div class="actions">
    <button type="button" class="choice" onclick={() => app.close()}>{t('apply.cancel')}</button>
    <button type="button" class="choice primary" disabled={!chosen.size} onclick={confirm}>
      {t('apply.confirm', { count: chosen.size })}
    </button>
  </div>
</Frame>

<style>
  .prompt {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: #ffffffd0;
  }
  .prompt .muted {
    font-size: 0.8125rem;
  }

  .holders {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    max-height: 22rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #ffffff40 transparent;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .holder {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .holder img {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 50%;
    object-fit: cover;
  }
  .holder strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rows li {
    margin: 0;
    padding: 0;
    border-top: 1px solid #ffffff14;
  }

  /* `button.row` outranks the frame's shared `.frame button` rule. */
  .rows button.row {
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
    height: 2.5rem;
    padding: 0 0.375rem;
    border-radius: 0;
    background: none;
    font-weight: 400;
    text-align: left;
  }
  .rows button.row:hover:not(:disabled) {
    background: color-mix(in srgb, var(--marks-mods-accent) 35%, transparent);
  }
  .rows button.row.checked {
    background: color-mix(in srgb, var(--marks-mods-accent) 22%, transparent);
  }
  .rows button.row i {
    flex: none;
    width: 1rem;
    color: #ffffffa0;
    text-align: center;
  }
  .rows button.row.checked i {
    color: #fff;
  }
  .rows button.row img {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    object-fit: cover;
  }
  .label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .name,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name {
    font-weight: 600;
  }
  .detail {
    color: #ffffff80;
    font-size: 0.75rem;
  }
  .match {
    flex: none;
    padding: 0.125rem 0.375rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--marks-mods-accent) 70%, transparent);
    color: #fff;
    font-size: 0.6875rem;
    font-weight: 700;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.5rem;
  }
  /* `button.choice` outranks the frame's shared `.frame button` rule. */
  .actions button.choice {
    width: 100%;
    height: 2.25rem;
  }
</style>
