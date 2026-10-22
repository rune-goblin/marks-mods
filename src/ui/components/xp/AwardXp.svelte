<script lang="ts">
  import { untrack } from 'svelte';
  import type { AwardXpApp } from '@/ui/AwardXpApp';
  import { isAward, XP_PRESETS, type PresetGroup, type XpPreset } from '@/xp/rules';
  import { localize as t } from '@/xp/xp';
  import Frame from './Frame.svelte';

  let { app }: { app: AwardXpApp } = $props();
  const { suggestion } = untrack(() => app);
  const groups: PresetGroup[] = ['encounter', 'accomplishment'];
  const id = (preset: XpPreset): string => `${preset.group}.${preset.key}`;
  const suggested = XP_PRESETS.find(
    (p) => p.group === 'encounter' && p.key === suggestion?.threat && p.xp === suggestion?.xp,
  );
  const threatLabel =
    suggestion && XP_PRESETS.some((p) => p.group === 'encounter' && p.key === suggestion.threat)
      ? t(`preset.encounter.${suggestion.threat}`)
      : (suggestion?.threat ?? '');

  let amount = $state<number | null | undefined>(suggestion?.xp ?? null);
  let picked = $state<string | null>(suggested ? id(suggested) : null);
  let busy = $state(false);

  const valid = $derived(isAward(amount));
  const label = $derived.by(() => {
    if (!isAward(amount)) return t('enter');
    return amount > 0 ? t('award', { xp: amount }) : t('remove', { xp: -amount });
  });

  function pick(preset: XpPreset): void {
    picked = id(preset);
    amount = preset.xp;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (busy || !isAward(amount)) return;
    busy = true;
    void app.award(amount);
  }
</script>

<Frame {app} title={t('title')} closeLabel={t('cancel')} onclose={() => app.close()}>
  {#if suggestion}
    <p class="combat">{t('combatEnded', { threat: threatLabel, xp: suggestion.xp })}</p>
  {/if}
  {#each groups as group (group)}
    {@const presets = XP_PRESETS.filter((p) => p.group === group)}
    <section>
      <span class="heading">{t(`group.${group}`)}</span>
      <div class="presets" style:--cols={presets.length}>
        {#each presets as preset (id(preset))}
          <button
            type="button"
            class="preset"
            class:active={picked === id(preset) && amount === preset.xp}
            onclick={() => pick(preset)}
          >
            <span class="name">{t(`preset.${id(preset)}`)}</span>
            <span class="xp">{preset.xp}</span>
          </button>
        {/each}
      </div>
    </section>
  {/each}

  <form onsubmit={submit}>
    <label class="field">
      <span class="heading">{t('amount')}</span>
      <input type="number" step="1" placeholder="0" bind:value={amount} onfocus={(e) => e.currentTarget.select()} />
      <span class="muted hint">{t('hint')}</span>
    </label>
    <div class="actions">
      <button type="button" class="choice" onclick={() => app.close()}>{t('cancel')}</button>
      <button type="submit" class="choice primary" disabled={!valid || busy}>
        <i class="fa-solid fa-star" inert></i>
        {label}
      </button>
    </div>
  </form>
</Frame>

<style>
  .combat {
    margin: 0;
    color: color-mix(in srgb, var(--marks-mods-accent) 45%, #fff);
    font-weight: 600;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  section + section,
  form {
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

  .presets {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 0.375rem;
  }
  /* `button.preset` outranks the frame's shared `.frame button` rule. */
  .presets button.preset {
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    height: 3.5rem;
    padding: 0 0.25rem;
    border-color: #ffffff1a;
  }
  .preset .name {
    font-size: 0.875rem;
    font-weight: 600;
    opacity: 0.8;
  }
  .preset .xp {
    font-size: 1.25rem;
    font-weight: 700;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .field input[type='number'] {
    width: 100%;
    height: 3rem;
    border-color: #ffffff40;
    font-size: 1.5rem;
  }
  .hint {
    font-size: 0.875rem;
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
