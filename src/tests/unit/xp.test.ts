import { describe, it, expect } from 'vitest';
import { celebrationPlan, drainPlan, isAward, nextXp, powerFromAmount, XP_PRESETS } from '@/xp/rules';

describe('nextXp', () => {
  it('adds an award', () => {
    expect(nextXp(500, 80)).toBe(580);
  });

  it('clamps a removal at zero', () => {
    expect(nextXp(20, -50)).toBe(0);
  });
});

describe('isAward', () => {
  it.each([1, -1, 160])('accepts %s', (amount) => {
    expect(isAward(amount)).toBe(true);
  });

  it.each([0, 1.5, NaN, null, undefined, '80'])('rejects %s', (amount) => {
    expect(isAward(amount)).toBe(false);
  });
});

describe('powerFromAmount', () => {
  it('is zero at and below 10 XP', () => {
    expect(powerFromAmount(5)).toBe(0);
    expect(powerFromAmount(10)).toBe(0);
  });

  it('hits each anchor exactly', () => {
    expect(powerFromAmount(80)).toBeCloseTo(0.55);
    expect(powerFromAmount(160)).toBe(1);
  });

  it('interpolates between anchors', () => {
    expect(powerFromAmount(100)).toBeCloseTo((0.55 + 0.78) / 2);
  });

  it('caps at full power', () => {
    expect(powerFromAmount(1000)).toBe(1);
  });
});

describe('celebrationPlan', () => {
  it('gives a minor accomplishment a puff of smoke and nothing else', () => {
    const plan = celebrationPlan(10);
    expect(plan.puffs).toBeGreaterThan(0);
    expect(plan.glints).toBeGreaterThan(0);
    expect(plan).toMatchObject({ sparks: 0, embers: 0, waves: 0, streaks: 0, rockets: 0, preFlash: false });
  });

  it('starts the sparkle burst at 30 XP', () => {
    expect(celebrationPlan(20).sparks).toBe(0);
    expect(celebrationPlan(30).sparks).toBeGreaterThan(0);
  });

  it('keeps fireworks for severe and extreme encounters', () => {
    expect(celebrationPlan(80).rockets).toBe(0);
    expect(celebrationPlan(120).rockets).toBe(1);
    expect(celebrationPlan(160).rockets).toBe(3);
  });

  it('grows every element with the award', () => {
    const amounts = [10, 30, 40, 60, 80, 120, 160];
    const plans = amounts.map(celebrationPlan);
    for (const key of ['puffs', 'glints', 'sparks', 'embers', 'waves', 'streaks', 'rockets'] as const) {
      const counts = plans.map((p) => p[key]);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    }
  });
});

describe('XP_PRESETS', () => {
  it('keys each preset uniquely within its group', () => {
    const ids = XP_PRESETS.map((p) => `${p.group}.${p.key}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('drainPlan', () => {
  it('matches the power of an award the same size', () => {
    expect(drainPlan(-80).power).toBe(celebrationPlan(80).power);
  });

  it('swirls more motes for a bigger loss', () => {
    const counts = [-10, -40, -80, -160].map((xp) => drainPlan(xp).motes);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBeLessThan(counts[3]);
  });
});
