<script lang="ts">
  import type { Snippet } from 'svelte';
  import { windowDrag } from '@/ui/windowDrag.svelte';

  let {
    app,
    title,
    closeLabel,
    onclose,
    children,
  }: {
    app: foundry.applications.api.ApplicationV2;
    title: string;
    closeLabel: string;
    onclose: () => void;
    children: Snippet;
  } = $props();
  const drag = windowDrag(() => app);
</script>

<div class="frame">
  <div
    class="titlebar"
    class:dragging={drag.dragging}
    role="presentation"
    onpointerdown={drag.start}
    onpointermove={drag.move}
    onpointerup={drag.end}
    onpointercancel={drag.end}
  >
    <span class="title">{title}</span>
    <button type="button" class="plain" aria-label={closeLabel} title={closeLabel} onclick={onclose}>
      <i class="fa-solid fa-xmark" inert></i>
    </button>
  </div>
  <div class="body">
    {@render children()}
  </div>
</div>

<style>
  .frame {
    width: 23rem;
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

  /* Shared by the content of every counteract window, which renders inside this frame. */
  .frame :global(.muted) {
    color: #ffffffa0;
  }

  .frame :global(button) {
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
  .frame :global(button:hover:not(:disabled)) {
    background: #ffffff1f;
  }
  .frame :global(button:focus-visible) {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }
  .frame :global(button:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  .frame :global(button.active),
  .frame :global(button.active:hover:not(:disabled)) {
    background: #e8e8f0;
    color: #0b0b14;
  }
  .frame :global(button.plain) {
    padding: 0;
    background: none;
    color: #ffffffa0;
  }
  .frame :global(button.plain:hover:not(:disabled)) {
    background: #ffffff1f;
    color: #fff;
  }
  .frame :global(button.primary) {
    height: 2.25rem;
    border-color: color-mix(in srgb, var(--marks-mods-accent) 70%, #fff);
    background: var(--marks-mods-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--marks-mods-accent) 80%, transparent);
    color: #fff;
    font-size: 0.9375rem;
    font-weight: 700;
  }
  .frame :global(button.primary:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--marks-mods-accent) 85%, #fff);
  }
  .frame :global(button.primary:disabled) {
    border-color: transparent;
    background: #ffffff10;
    box-shadow: none;
    color: #ffffff80;
    opacity: 1;
  }

  .frame :global(input[type='number']) {
    width: 3.5rem;
    height: 1.75rem;
    min-height: 0;
    margin: 0;
    padding: 0 0.375rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    background: #00000066;
    box-shadow: none;
    color: #fff;
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 700;
    text-align: center;
  }
  .frame :global(input[type='number']:focus) {
    border-color: color-mix(in srgb, var(--marks-mods-accent) 70%, #fff);
    outline: none;
  }
  .frame :global(input[type='number']:invalid) {
    border-color: #c0392b;
  }
</style>
