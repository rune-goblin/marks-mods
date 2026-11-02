<script lang="ts">
  import { untrack } from 'svelte';
  import { localize as t } from '@/counteract/counteract';
  import { LEVELS, degreeNeeded, levelBasedDC, levelForRank, levelMatching, rankForLevel } from '@/counteract/rules';
  import type { CounteractReviewApp } from '@/ui/CounteractReviewApp';
  import Frame from './Frame.svelte';

  type Field = number | null | undefined;

  let { app }: { app: CounteractReviewApp } = $props();
  const { request, suggestion, roller } = untrack(() => app);
  const user = game.users.get(request.userId)?.name ?? '';
  const actor = roller?.name ?? '';

  let sourceRank = $state<Field>(untrack(() => request.sourceRank));
  let targetRank = $state<Field>(untrack(() => suggestion.rank));
  let dc = $state<Field>(untrack(() => suggestion.dc));
  let sourceLevel = $state<number | null>(
    untrack(() =>
      request.source.kind === 'skill' && roller ? roller.level : levelForRank(request.sourceRank),
    ),
  );
  let targetLevel = $state<number | null>(untrack(() => levelMatching({ rank: suggestion.rank, dc: suggestion.dc })));

  // A hand-edited rank or DC that no longer fits the chosen level shows as custom.
  const shownSourceLevel = $derived(
    sourceLevel !== null && rankForLevel(sourceLevel) === sourceRank ? String(sourceLevel) : '',
  );
  const shownTargetLevel = $derived(
    targetLevel !== null && rankForLevel(targetLevel) === targetRank && levelBasedDC(targetLevel) === dc
      ? String(targetLevel)
      : '',
  );

  function pickSourceLevel(value: string): void {
    if (value === '') return;
    sourceLevel = Number(value);
    sourceRank = rankForLevel(sourceLevel);
  }

  function pickTargetLevel(value: string): void {
    if (value === '') return;
    targetLevel = Number(value);
    targetRank = rankForLevel(targetLevel);
    dc = levelBasedDC(targetLevel);
  }

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
      <span>{t('review.level')}</span>
      <select class="level" value={shownSourceLevel} onchange={(event) => pickSourceLevel(event.currentTarget.value)}>
        <option value="" disabled>{t('review.custom')}</option>
        {#each LEVELS as level (level)}
          <option value={String(level)}>{t('review.sourceLevel', { level, rank: rankForLevel(level) })}</option>
        {/each}
      </select>
    </label>
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
        <span>{t('review.level')}</span>
        <select class="level" value={shownTargetLevel} onchange={(event) => pickTargetLevel(event.currentTarget.value)}>
          <option value="" disabled>{t('review.custom')}</option>
          {#each LEVELS as level (level)}
            <option value={String(level)}>
              {t('review.targetLevel', { level, rank: rankForLevel(level), dc: levelBasedDC(level) })}
            </option>
          {/each}
        </select>
      </label>
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
  /* `select.level` outranks Foundry's global select rule. */
  .field select.level {
    grid-column: 2 / 4;
    width: 100%;
    height: 1.75rem;
    margin: 0;
    padding: 0 0.375rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    background: #00000066;
    box-shadow: none;
    color: #fff;
    font-family: inherit;
    font-size: 0.875rem;
  }
  .field select.level:focus {
    border-color: color-mix(in srgb, var(--marks-mods-accent) 70%, #fff);
    outline: none;
  }
  .field select.level option {
    background: #1b1b1f;
    color: #fff;
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
