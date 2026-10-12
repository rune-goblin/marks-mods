export const DEFAULT_ACTIONS = 3;

export function isShardstormSlug(slug: string | null | undefined): boolean {
  return slug?.startsWith('wand-of-shardstorm') ?? false;
}

export function isForceBarrageSlug(slug: string | null | undefined): boolean {
  return slug === 'force-barrage';
}

export function shardsPerAction(rank: number): number {
  return 1 + Math.floor((rank - 1) / 2);
}

export function distribute(shards: number, targets: number): number[] {
  const base = Math.floor(shards / targets);
  const extra = shards % targets;
  return Array.from({ length: targets }, (_, index) => base + (index < extra ? 1 : 0));
}
