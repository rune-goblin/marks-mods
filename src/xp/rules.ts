export type PresetGroup = 'encounter' | 'accomplishment';

export interface XpPreset {
  group: PresetGroup;
  key: string;
  xp: number;
}

/** GM Core party XP awards for a four-character party. */
export const XP_PRESETS: readonly XpPreset[] = [
  { group: 'encounter', key: 'trivial', xp: 40 },
  { group: 'encounter', key: 'low', xp: 60 },
  { group: 'encounter', key: 'moderate', xp: 80 },
  { group: 'encounter', key: 'severe', xp: 120 },
  { group: 'encounter', key: 'extreme', xp: 160 },
  { group: 'accomplishment', key: 'minor', xp: 10 },
  { group: 'accomplishment', key: 'moderate', xp: 30 },
  { group: 'accomplishment', key: 'major', xp: 80 },
];

export const DEFAULT_SPARKLE_AMOUNT = 80;

/** Removing XP never takes a character below zero. */
export function nextXp(current: number, amount: number): number {
  return Math.max(0, current + amount);
}

export function isAward(amount: unknown): amount is number {
  return Number.isInteger(amount) && amount !== 0;
}

// Anchored at the preset values. 10 XP is a bare puff of smoke; 160 XP is full fireworks.
const POWER_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [10, 0],
  [30, 0.15],
  [40, 0.25],
  [60, 0.4],
  [80, 0.55],
  [120, 0.78],
  [160, 1],
];

/** Celebration power in 0–1, interpolated linearly between the anchors. */
export function powerFromAmount(amount: number): number {
  const [first] = POWER_ANCHORS;
  if (amount <= first[0]) return first[1];
  for (let i = 0; i < POWER_ANCHORS.length - 1; i++) {
    const [a1, p1] = POWER_ANCHORS[i];
    const [a2, p2] = POWER_ANCHORS[i + 1];
    if (amount <= a2) return p1 + ((amount - a1) / (a2 - a1)) * (p2 - p1);
  }
  return POWER_ANCHORS[POWER_ANCHORS.length - 1][1];
}

export interface CelebrationPlan {
  power: number;
  puffs: number;
  glints: number;
  sparks: number;
  embers: number;
  waves: number;
  streaks: number;
  preFlash: boolean;
  rockets: number;
}

/** What each award size shows: smoke and glints always, then a burst, shock waves and fireworks. */
export function celebrationPlan(amount: number): CelebrationPlan {
  const power = powerFromAmount(amount);
  const sparks = power < 0.15 ? 0 : Math.round(20 + power * 80 + power * power * 60);
  return {
    power,
    puffs: Math.round(7 + power * 5),
    glints: Math.round(6 + power * 10),
    sparks,
    embers: power > 0.5 ? Math.round(8 + power * 14) : 0,
    waves: power > 0.7 ? 2 : power > 0.3 ? 1 : 0,
    streaks: power > 0.65 ? Math.round(sparks * 0.12) : 0,
    preFlash: power > 0.6,
    rockets: power >= 0.75 ? 1 + Math.round(((power - 0.75) / 0.25) * 2) : 0,
  };
}

export interface DrainPlan {
  power: number;
  motes: number;
  puffs: number;
}

/** A loss scales on the same curve as an award of the same size. */
export function drainPlan(amount: number): DrainPlan {
  const power = powerFromAmount(Math.abs(amount));
  return { power, motes: Math.round(16 + power * 40), puffs: Math.round(4 + power * 4) };
}
