<script lang="ts">
  import { untrack } from 'svelte';
  import {
    localize as t,
    rollCounteract,
    sourceRank,
    sourceRef,
    type CounteractSource,
    type PickerSession,
  } from '@/counteract/counteract';
  import { sendRequest } from '@/counteract/socket';
  import type { CounteractApp } from '@/ui/CounteractApp';
  import Frame from './Frame.svelte';

  let { app, session }: { app: CounteractApp; session: PickerSession } = $props();
  const { actor, targetName, skillRank, spells, skills } = untrack(() => session);
  const isGM = game.user.isGM;
  const signed = new Intl.NumberFormat(game.i18n.lang, { signDisplay: 'always' });

  let tab = $state<'spells' | 'skills'>(untrack(() => (session.spells.length ? 'spells' : 'skills')));
  let showAll = $state(false);
  let waiting = $state<CounteractSource | null>(null);

  const shownSpells = $derived(showAll ? spells : spells.filter((spell) => spell.counteracts));

  function sourceName(source: CounteractSource): string {
    return source.kind === 'spell' ? source.spell.name : source.label;
  }

  async function pick(source: CounteractSource): Promise<void> {
    const pending = sendRequest({
      requestId: foundry.utils.randomID(),
      userId: game.user.id,
      cardId: session.cardId,
      actorUuid: actor.uuid,
      source: sourceRef(source),
      sourceRank: sourceRank(session, source),
    });
    if (!pending) return;
    if (isGM) {
      void app.close();
    } else {
      waiting = source;
      app.pending = pending;
    }
    const reply = await pending.reply;
    app.pending = null;
    void app.close();
    if (reply.type === 'approve') await rollCounteract(session, source, reply.approval);
    else if (reply.type === 'refuse' && !isGM) ui.notifications.info(t('refused'));
  }
</script>

<Frame {app} title={t('title', { name: actor.name })} closeLabel={t('close')} onclose={() => app.close()}>
  <div class="target">
    <span class="muted">{t('target')}</span>
    <strong>{targetName}</strong>
  </div>

  {#if waiting}
    <div class="waiting">
      <i class="fa-solid fa-hourglass-half" inert></i>
      <span>{t('waiting', { source: sourceName(waiting) })}</span>
    </div>
    <button type="button" onclick={() => app.close()}>{t('cancel')}</button>
  {:else}
    <div class="toolbar">
      <div class="tabs" role="group">
        <button
          type="button"
          class:active={tab === 'spells'}
          aria-pressed={tab === 'spells'}
          onclick={() => (tab = 'spells')}
        >
          {t('spells')}
        </button>
        <button
          type="button"
          class:active={tab === 'skills'}
          aria-pressed={tab === 'skills'}
          onclick={() => (tab = 'skills')}
        >
          {t('skills')}
        </button>
      </div>
      {#if tab === 'spells'}
        <button type="button" class:active={showAll} aria-pressed={showAll} onclick={() => (showAll = !showAll)}>
          {t('showAll')}
        </button>
      {/if}
    </div>

    <ul class="rows">
      {#if tab === 'spells'}
        {#each shownSpells as source (source.key)}
          <li>
            <button type="button" class="row" onclick={() => pick(source)}>
              <img src={source.spell.img} alt="" />
              <span class="label">
                <span class="name">
                  <span class="text">{source.spell.name}</span>
                  {#if source.slots > 1}
                    <span class="muted">{t('slots', { count: source.slots })}</span>
                  {/if}
                </span>
                <span class="detail">{source.entry.name}</span>
              </span>
              <span class="rank">{t('rank', { rank: source.castRank })}</span>
            </button>
          </li>
        {:else}
          <li class="empty">{spells.length ? t('empty') : t('noSpells', { name: actor.name })}</li>
        {/each}
      {:else}
        {#each skills as source (source.key)}
          <li>
            <button type="button" class="row" onclick={() => pick(source)}>
              <span class="label">
                <span class="name"><span class="text">{source.label}</span></span>
                <span class="detail">{signed.format(source.modifier)}</span>
              </span>
              <span class="rank">{t('rank', { rank: skillRank })}</span>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</Frame>

<style>
  .target {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .target strong {
    overflow: hidden;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .waiting {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px dashed #ffffff40;
    border-radius: 4px;
    color: #ffffffd0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .rows {
    display: flex;
    flex-direction: column;
    min-height: 5rem;
    max-height: 20rem;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #ffffff40 transparent;
  }
  .rows li {
    flex: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid #ffffff14;
  }
  .rows li.empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    border: 1px dashed #ffffff40;
    border-radius: 4px;
    color: #ffffffa0;
    text-align: center;
    white-space: normal;
  }

  /* `button.row` outranks the frame's shared `.frame button` rule. */
  .rows button.row {
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
    height: 2.75rem;
    padding: 0 0.375rem;
    border-radius: 0;
    background: none;
    font-weight: 400;
    text-align: left;
  }
  .rows button.row:hover:not(:disabled) {
    background: color-mix(in srgb, var(--marks-mods-accent) 35%, transparent);
  }
  .rows button.row img {
    flex: none;
    width: 2rem;
    height: 2rem;
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
  .name {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    font-weight: 600;
  }
  .text,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .detail {
    color: #ffffff80;
    font-size: 0.75rem;
  }
  .rank {
    flex: none;
    font-weight: 700;
  }
</style>
