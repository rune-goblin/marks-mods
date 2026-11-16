import { describe, it, expect } from 'vitest';
import { clampCount, copperToCoins, isSaleCount, isSalePercent, saleCopper, salePercent } from '@/sell/rules';

describe('salePercent', () => {
  it('sells treasure at full value', () => {
    expect(salePercent(true, 50)).toBe(100);
  });

  it('uses the setting for other goods, clamped to 0–100', () => {
    expect(salePercent(false, 50)).toBe(50);
    expect(salePercent(false, 150)).toBe(100);
    expect(salePercent(false, -5)).toBe(0);
  });
});

describe('saleCopper', () => {
  it('sells a whole stack at half value', () => {
    expect(saleCopper(170_000, 1, 1, 50)).toBe(85_000);
  });

  it('sells part of a stack', () => {
    expect(saleCopper(3_040_000, 4, 1, 50)).toBe(380_000);
  });

  it('rounds down to the copper', () => {
    expect(saleCopper(5, 1, 1, 50)).toBe(2);
  });

  it('pays nothing for an empty sale', () => {
    expect(saleCopper(100, 0, 1, 50)).toBe(0);
    expect(saleCopper(100, 2, 0, 50)).toBe(0);
  });
});

describe('copperToCoins', () => {
  it('splits copper into gold, silver and copper', () => {
    expect(copperToCoins(12_345)).toEqual({ gp: 123, sp: 4, cp: 5 });
  });

  it('floors fractions and negatives', () => {
    expect(copperToCoins(9.9)).toEqual({ gp: 0, sp: 0, cp: 9 });
    expect(copperToCoins(-4)).toEqual({ gp: 0, sp: 0, cp: 0 });
  });
});

describe('clampCount', () => {
  it('keeps a count between 1 and the stack', () => {
    expect(clampCount(0, 4)).toBe(1);
    expect(clampCount(3, 4)).toBe(3);
    expect(clampCount(9, 4)).toBe(4);
  });
});

describe('isSaleCount', () => {
  it.each([1, 3, 4])('accepts %s of 4', (count) => {
    expect(isSaleCount(count, 4)).toBe(true);
  });

  it.each([0, 5, 1.5, NaN, null, undefined, '2'])('rejects %s of 4', (count) => {
    expect(isSaleCount(count, 4)).toBe(false);
  });
});

describe('isSalePercent', () => {
  it.each([0, 50, 120, 12.5])('accepts %s', (percent) => {
    expect(isSalePercent(percent)).toBe(true);
  });

  it.each([-1, NaN, Infinity, null, undefined, '50'])('rejects %s', (percent) => {
    expect(isSalePercent(percent)).toBe(false);
  });
});
