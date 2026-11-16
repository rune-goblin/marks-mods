<script lang="ts">
  import { untrack } from 'svelte';
  import type { SellApp } from '@/ui/SellApp';
  import { clampCount, isSaleCount, isSalePercent, saleCopper } from '@/sell/rules';
  import { formatCopper, localize as t } from '@/sell/sell';
  import Frame from '../xp/Frame.svelte';

  let { app }: { app: SellApp } = $props();
  const { name, img, quantity, stackCopper, percent: defaultPercent, askCount, askPrice } = untrack(() => app.sale);

  let count = $state<number | null | undefined>(1);
  let percent = $state<number | null | undefined>(defaultPercent);
  let busy = $state(false);

  const countValid = $derived(isSaleCount(count, quantity));
  const percentValid = $derived(isSalePercent(percent));
  const eachCopper = $derived(percentValid ? saleCopper(stackCopper, quantity, 1, percent as number) : 0);
  const totalCopper = $derived(
    countValid && percentValid ? saleCopper(stackCopper, quantity, count as number, percent as number) : 0,
  );
  const valid = $derived(countValid && percentValid && (askPrice || totalCopper > 0));

  function step(delta: number): void {
    count = clampCount((isSaleCount(count, quantity) ? count : 1) + delta, quantity);
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (busy || !valid) return;
    busy = true;
    void app.confirm(count as number, totalCopper);
  }

  function focusIf(node: HTMLInputElement, focus: boolean): void {
    if (focus) requestAnimationFrame(() => node.focus());
  }

  function selectAll(event: FocusEvent & { currentTarget: HTMLInputElement }): void {
    event.currentTarget.select();
  }
</script>

<Frame {app} title={t('title', { name })} closeLabel={t('cancel')} onclose={() => app.close()}>
  <div class="item">
    <img src={img} alt="" />
    <span class="name">{name}</span>
    {#if quantity > 1}<span class="muted">×{quantity}</span>{/if}
  </div>

  <form onsubmit={submit}>
    {#if askCount}
      <div class="field">
        <span class="heading">{t('count', { max: quantity })}</span>
        <div class="stepper">
          <button type="button" aria-label={t('fewer')} disabled={!countValid || count === 1} onclick={() => step(-1)}>
            <i class="fa-solid fa-minus" inert></i>
          </button>
          <input
            type="number"
            min="1"
            max={quantity}
            step="1"
            aria-label={t('count', { max: quantity })}
            bind:value={count}
            onfocus={selectAll}
            use:focusIf={!askPrice}
          />
          <button
            type="button"
            aria-label={t('more')}
            disabled={countValid && count === quantity}
            onclick={() => step(1)}
          >
            <i class="fa-solid fa-plus" inert></i>
          </button>
          <button type="button" class:active={count === quantity} onclick={() => (count = quantity)}>
            {t('all')}
          </button>
        </div>
      </div>
    {/if}

    {#if askPrice}
      <div class="field">
        <span class="heading">{t('price')}</span>
        <div class="percent">
          <input
            type="number"
            min="0"
            step="5"
            aria-label={t('price')}
            bind:value={percent}
            onfocus={selectAll}
            use:focusIf={true}
          />
          <span class="unit">%</span>
          <span class="muted">{t('each', { value: formatCopper(eachCopper) })}</span>
        </div>
      </div>
    {:else}
      <p class="muted hint">{t('atPercent', { percent: defaultPercent, value: formatCopper(eachCopper) })}</p>
    {/if}

    <div class="total">
      <span class="heading">{t('total')}</span>
      <span class="gold">{valid || askPrice ? formatCopper(totalCopper) : '—'}</span>
    </div>

    <div class="actions">
      <button type="button" class="choice" onclick={() => app.close()}>{t('cancel')}</button>
      <button type="submit" class="choice primary" disabled={!valid || busy}>
        <i class="fa-solid fa-coins" inert></i>
        {valid ? t('confirm', { count: count as number }) : t('enter')}
      </button>
    </div>
  </form>
</Frame>

<style>
  .item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-weight: 600;
  }
  .item img {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid #ffffff2a;
    border-radius: 4px;
    object-fit: cover;
  }
  .item .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #ffffff14;
  }
  .heading {
    color: #ffffffa0;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stepper {
    display: grid;
    grid-template-columns: 2.75rem 1fr 2.75rem 4.5rem;
    gap: 0.375rem;
  }
  .stepper button,
  .stepper input[type='number'] {
    width: 100%;
    height: 2.75rem;
  }
  .stepper input[type='number'],
  .percent input[type='number'] {
    border-color: #ffffff40;
    font-size: 1.375rem;
  }

  .percent {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .percent input[type='number'] {
    width: 6rem;
    height: 2.75rem;
  }
  .percent .unit {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .hint {
    margin: 0;
    font-size: 0.875rem;
  }

  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid #b8860b80;
    border-radius: 4px;
    background: #b8860b1a;
  }
  .total .gold {
    color: #f0c75e;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.5rem;
  }
  .actions button.choice {
    width: 100%;
    height: 2.75rem;
    font-size: 1rem;
  }
</style>
