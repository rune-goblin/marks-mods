<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    localize as t,
    targetName,
    targetedTokens,
    tokenImage,
    tokenOf,
    type Assignment,
    type Barrage,
  } from '@/barrage/barrage';
  import { DEFAULT_ACTIONS, distribute } from '@/barrage/rules';
  import { MODULE_ID } from '@/constants';
  import type { BarrageApp } from '@/ui/BarrageApp';
  import { windowDrag } from '@/ui/windowDrag.svelte';

  let { app, barrage }: { app: BarrageApp; barrage: Barrage } = $props();
  const { actor, name, img, rank, perAction, pending, ongoing } = untrack(() => barrage);
  const closeLabel = t(pending ? 'cancel' : 'close');
  const drag = windowDrag(() => app);

  const glyph = (count: string): string =>
    `url("${foundry.utils.getRoute(`modules/${MODULE_ID}/assets/action-icons/${count}-action.svg`)}")`;
  const ACTIONS = [
    { count: 1, mask: glyph('one'), ratio: '36 / 36' },
    { count: 2, mask: glyph('two'), ratio: '54 / 36' },
    { count: 3, mask: glyph('three'), ratio: '70 / 36' },
  ];

  let rows = $state<Assignment[]>(untrack(() => barrage.targets.map((target) => ({ ...target }))));
  let opening = $state(untrack(() => barrage.opening));
  let actions = $state(DEFAULT_ACTIONS);
  let firing = $state(false);
  let sceneTick = $state(0);

  const total = $derived(perAction * (opening ? actions : 1));
  const assigned = $derived(rows.reduce((sum, row) => sum + row.shards, 0));
  const remaining = $derived(total - assigned);
  const shown = $derived.by(() => {
    void sceneTick;
    return rows.map((row) => {
      const token = tokenOf(row.token);
      return { ...row, name: token ? targetName(token) : '', img: token ? tokenImage(token) : '' };
    });
  });

  onMount(() => {
    const refresh = (): void => {
      sceneTick++;
    };
    const prune = (): void => {
      rows = rows.filter((row) => tokenOf(row.token));
    };
    Hooks.on('updateToken', refresh);
    Hooks.on('deleteToken', prune);
    return () => {
      Hooks.off('updateToken', refresh);
      Hooks.off('deleteToken', prune);
    };
  });

  function respread(): void {
    const counts = distribute(total, rows.length);
    rows = rows.map((row, index) => ({ token: row.token, shards: counts[index] }));
  }

  function updateTargets(): void {
    const tokens = targetedTokens(actor);
    if (!tokens.length) {
      ui.notifications.warn(t('warn.noTargets'));
      return;
    }
    if (tokens.length > total) ui.notifications.warn(t('warn.tooMany', { total }));
    rows = tokens.slice(0, total).map((token) => ({ token, shards: 0 }));
    respread();
  }

  function remove(uuid: string): void {
    rows = rows.filter((row) => row.token !== uuid);
    respread();
  }

  function adjust(uuid: string, delta: number): void {
    rows = rows.map((row) => (row.token === uuid ? { ...row, shards: row.shards + delta } : row));
  }

  function setActions(count: number): void {
    actions = count;
    respread();
  }

  function hover(uuid: string, event: PointerEvent, inside: boolean): void {
    const token = tokenOf(uuid)?.object;
    if (inside) token?.emitHoverIn(event);
    else token?.emitHoverOut(event);
  }

  async function shoot(event: MouseEvent): Promise<void> {
    firing = true;
    try {
      if (!(await barrage.fire($state.snapshot(rows), event as PointerEvent))) return;
      if (!ongoing) {
        await app.release();
        return;
      }
      if (opening) {
        opening = false;
        respread();
      }
      await barrage.save($state.snapshot(rows));
    } finally {
      firing = false;
    }
  }
</script>

<div class="barrage">
  <div
    class="titlebar"
    class:dragging={drag.dragging}
    role="presentation"
    onpointerdown={drag.start}
    onpointermove={drag.move}
    onpointerup={drag.end}
    onpointercancel={drag.end}
  >
    <span class="title">{actor.name}</span>
    {#if !ongoing}
      <button type="button" class="plain" aria-label={closeLabel} title={closeLabel} onclick={() => app.release()}>
        <i class="fa-solid fa-xmark" inert></i>
      </button>
    {/if}
  </div>

  <div class="body">
    <div class="source">
      <img src={img} alt="" />
      <div class="details">
        <div class="name"><strong>{name}</strong><span class="muted">{t('rank', { rank })}</span></div>
        {#if opening}
          <div class="actions">
            <span class="muted">{t('actions')}</span>
            {#each ACTIONS as choice (choice.count)}
              <button
                type="button"
                class:active={actions === choice.count}
                aria-pressed={actions === choice.count}
                aria-label={t(`action.${choice.count}`)}
                onclick={() => setActions(choice.count)}
              >
                <span class="glyph" style:aspect-ratio={choice.ratio} style:mask-image={choice.mask}></span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="muted">{t('turn', { shards: perAction })}</div>
        {/if}
      </div>
    </div>

    <div class="target-bar">
      <button type="button" onclick={updateTargets}>
        <i class="fa-solid fa-bullseye" inert></i>
        <span>{t('target')}</span>
      </button>
      <span class="count">{t(total === 1 ? 'countOne' : 'count', { assigned, total })}</span>
    </div>

    <ul class="rows">
      {#each shown as row (row.token)}
        <li
          class:idle={row.shards === 0}
          onpointerenter={(event) => hover(row.token, event, true)}
          onpointerleave={(event) => hover(row.token, event, false)}
        >
          <img src={row.img} alt="" />
          <span class="row-name">{row.name}</span>
          <button
            type="button"
            aria-label={t('fewer', { name: row.name })}
            disabled={row.shards < 1}
            onclick={() => adjust(row.token, -1)}
          >
            <i class="fa-solid fa-minus" inert></i>
          </button>
          <span class="shards">{row.shards}</span>
          <button
            type="button"
            aria-label={t('more', { name: row.name })}
            disabled={assigned >= total}
            onclick={() => adjust(row.token, 1)}
          >
            <i class="fa-solid fa-plus" inert></i>
          </button>
          <button type="button" class="plain" aria-label={t('remove', { name: row.name })} onclick={() => remove(row.token)}>
            <i class="fa-solid fa-xmark" inert></i>
          </button>
        </li>
      {:else}
        <li class="empty">{t('pick')}</li>
      {/each}
    </ul>

    <button type="button" class="fire" disabled={firing || remaining !== 0} onclick={shoot}>
      {remaining === 0 ? t(total === 1 ? 'fireOne' : 'fire', { total }) : t('assign', { remaining })}
    </button>
  </div>
</div>

<style>
  .barrage {
    width: 21rem;
    border-radius: 6px;
    background: color-mix(in srgb, #0b0b14 94%, transparent);
    border: 1px solid color-mix(in srgb, var(--marks-mods-accent) 55%, #000);
    box-shadow: 0 2px 10px #000a;
    backdrop-filter: blur(3px);
    color: #e8e8f0;
    font-family: 'Signika', sans-serif;
    font-size: 0.875rem;
    line-height: 1.3;
    overflow: hidden;
    user-select: none;
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.25rem 0 0.75rem;
    background: #00000066;
    border-bottom: 1px solid #ffffff1f;
    font-weight: 600;
    cursor: grab;
    touch-action: none;
  }
  .titlebar.dragging {
    cursor: grabbing;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }
  .muted {
    color: #ffffffa0;
  }

  .source {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .source img {
    flex: none;
    width: 3rem;
    height: 3rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    object-fit: cover;
  }
  .details {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
  }
  .name strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name .muted {
    flex: none;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .actions .muted {
    margin-right: 0.25rem;
  }
  .glyph {
    display: block;
    height: 1rem;
    background: currentColor;
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: contain;
  }

  .target-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .count {
    color: #ffffffa0;
    font-weight: 600;
  }

  .rows {
    display: flex;
    flex-direction: column;
    min-height: 5rem;
    max-height: 17.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #ffffff40 transparent;
  }
  .rows li {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 2.5rem;
    margin: 0;
    padding: 0;
    border-top: 1px solid #ffffff14;
  }
  .rows li.empty {
    flex: 1;
    justify-content: center;
    height: auto;
    border: 1px dashed #ffffff40;
    border-radius: 4px;
    color: #ffffffa0;
  }
  .rows img {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: 50%;
    object-fit: cover;
  }
  .row-name {
    flex: 1;
    min-width: 0;
    margin-left: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .shards {
    width: 2rem;
    color: #fff;
    font-size: 1.25rem;
    font-weight: 700;
    text-align: center;
  }
  .rows li.idle img,
  .rows li.idle .row-name {
    opacity: 0.45;
  }
  .rows li.idle .shards {
    color: #ffffff73;
  }

  button {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    width: auto;
    height: 1.75rem;
    min-width: 1.75rem;
    min-height: 0;
    margin: 0;
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: #ffffff10;
    box-shadow: none;
    color: #e8e8f0;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: #ffffff1f;
  }
  button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.active,
  button.active:hover:not(:disabled) {
    background: #e8e8f0;
    color: #0b0b14;
  }
  button.plain {
    padding: 0;
    background: none;
    color: #ffffffa0;
  }
  button.plain:hover:not(:disabled) {
    background: #ffffff1f;
    color: #fff;
  }

  button.fire {
    height: 2.25rem;
    border-color: color-mix(in srgb, var(--marks-mods-accent) 70%, #fff);
    background: var(--marks-mods-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--marks-mods-accent) 80%, transparent);
    color: #fff;
    font-size: 0.9375rem;
    font-weight: 700;
  }
  button.fire:hover:not(:disabled) {
    background: color-mix(in srgb, var(--marks-mods-accent) 85%, #fff);
  }
  button.fire:disabled {
    border-color: transparent;
    background: #ffffff10;
    box-shadow: none;
    color: #ffffff80;
    opacity: 1;
  }
</style>
