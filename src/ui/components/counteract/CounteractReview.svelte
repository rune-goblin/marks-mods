<script lang="ts">
  import type { ActorPF2e } from 'foundry-pf2e';
  import { untrack } from 'svelte';
  import { localize as t } from '@/counteract/counteract';
  import { degreeNeeded } from '@/counteract/rules';
  import type { CounteractReviewApp } from '@/ui/CounteractReviewApp';
  import Frame from './Frame.svelte';

  type Field = number | null | undefined;

  let { app }: { app: CounteractReviewApp } = $props();
  const { request, suggestion } = untrack(() => app);
  const user = game.users.get(request.userId)?.name ?? '';
  const actor = fromUuidSync<ActorPF2e>(request.actorUuid)?.name ?? '';

  let sourceRank = $state<Field>(untrack(() => request.sourceRank));
  let targetRank = $state<Field>(untrack(() => suggestion.rank));
  let dc = $state<Field>(untrack(() => suggestion.dc));

  const isCount = (value: Field): value is number => Number.isInteger(value) && (value as number) >= 0;
  const ready = $derived(!suggestion.gone && isCount(sourceRank) && isCount(targetRank) && isCount(dc));
  const needed = $derived(
    isCount(sourceRank) && isCount(targetRank) ? t(`needs.${degreeNeeded(sourceRank, targetRank) ?? 'never'}`) : '',
  );

  function approve(): void {
    if (suggestion.gone || !isCount(sourceRank) || !isCount(targetRank) || !isCount(dc)) return;
    void app.approve({ targetName: suggestion.name, sourceRank, targetRank, dc });
  }
</script>

<Frame {app} title={t('review.title')} closeLabel={t('review.refuse')} onclose={() => app.close()}>
  <div class="from">{t('review.from', { user, actor })}</div>

  <section>
    <span class="heading">{t('review.source')}</span>
    <div class="subject">
      <strong>{request.source.name}</strong>
    </div>
    <label class="field">
      <span>{t('review.rank')}</span>
      <input type="number" min="0" step="1" required bind:value={sourceRank} />
    </label>
  </section>

  <section>
    <span class="heading">{t('review.target')}</span>
    {#if suggestion.gone}
      <div class="gone">{t('review.gone')}</div>
    {:else}
      <div class="subject">
        {#if suggestion.img}
          <img src={suggestion.img} alt="" />
        {/if}
        <strong>{suggestion.name}</strong>
      </div>
      <label class="field">
        <span>{t('review.rank')}</span>
        <input type="number" min="0" step="1" required bind:value={targetRank} />
        <span class="basis">{suggestion.rankBasis}</span>
      </label>
      <label class="field">
        <span>{t('review.dc')}</span>
        <input type="number" min="0" step="1" required bind:value={dc} />
        <span class="basis">{suggestion.dcBasis}</span>
      </label>
    {/if}
  </section>

  {#if needed && !suggestion.gone}
    <div class="needed">{needed}</div>
  {/if}

  <div class="actions">
    <button type="button" class="choice" onclick={() => app.close()}>{t('review.refuse')}</button>
    <button type="button" class="choice primary" disabled={!ready} onclick={approve}>
      {t('review.approve')}
    </button>
  </div>
</Frame>

<style>
  .from {
    color: #ffffffd0;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-top: 0.625rem;
    border-top: 1px solid #ffffff14;
  }
  .heading {
    color: #ffffffa0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .subject {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .subject strong {
    overflow: hidden;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subject img {
    flex: none;
    width: 2rem;
    height: 2rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    object-fit: cover;
  }

  .field {
    display: grid;
    grid-template-columns: 7.5rem auto 1fr;
    align-items: center;
    gap: 0.5rem;
  }
  .basis {
    min-width: 0;
    color: #ffffff80;
    font-size: 0.75rem;
  }

  .gone {
    padding: 0.5rem 0.75rem;
    border: 1px dashed #ffffff40;
    border-radius: 4px;
    color: #ffffffd0;
  }

  .needed {
    color: color-mix(in srgb, var(--marks-mods-accent) 45%, #fff);
    font-weight: 600;
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
