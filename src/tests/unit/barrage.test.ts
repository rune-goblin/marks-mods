import { describe, it, expect } from 'vitest';
import { distribute, isForceBarrageSlug, isShardstormSlug, shardsPerAction } from '@/barrage/rules';

describe('isShardstormSlug', () => {
  it.each([
    'wand-of-shardstorm-1st-rank-spell',
    'wand-of-shardstorm-3rd-rank-spell',
    'wand-of-shardstorm-5th-rank-spell',
    'wand-of-shardstorm-7th-rank-spell',
  ])('matches %s', (slug) => {
    expect(isShardstormSlug(slug)).toBe(true);
  });

  it.each(['wand-of-fey-flames', 'magic-wand-1st-rank-spell', '', null, undefined])('rejects %s', (slug) => {
    expect(isShardstormSlug(slug)).toBe(false);
  });
});

describe('isForceBarrageSlug', () => {
  it('matches force barrage only', () => {
    expect(isForceBarrageSlug('force-barrage')).toBe(true);
    expect(isForceBarrageSlug('force-cage')).toBe(false);
    expect(isForceBarrageSlug(null)).toBe(false);
  });
});

describe('shardsPerAction', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 3],
    [7, 4],
    [9, 5],
  ])('rank %i releases %i per action', (rank, shards) => {
    expect(shardsPerAction(rank)).toBe(shards);
  });
});

describe('distribute', () => {
  it('splits evenly', () => {
    expect(distribute(6, 2)).toEqual([3, 3]);
    expect(distribute(9, 3)).toEqual([3, 3, 3]);
  });

  it('gives the remainder to the first targets', () => {
    expect(distribute(3, 2)).toEqual([2, 1]);
    expect(distribute(4, 3)).toEqual([2, 1, 1]);
  });

  it('leaves later targets empty when shards run short', () => {
    expect(distribute(2, 4)).toEqual([1, 1, 0, 0]);
  });

  it('returns nothing for no targets', () => {
    expect(distribute(3, 0)).toEqual([]);
  });
});
