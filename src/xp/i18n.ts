import { MODULE_ID } from '@/constants';

export function localize(key: string, data?: Record<string, string | number>): string {
  const path = `${MODULE_ID}.xp.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}
