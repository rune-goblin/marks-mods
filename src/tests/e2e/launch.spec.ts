import { test, expect, MODULE_ID } from './fixtures/foundry-clients';

test.describe('Module launches', () => {
  test('exposes the public API', async ({ gmPage }) => {
    const api = await gmPage.evaluate((id) => {
      const entries = Object.entries((window as any).game.modules.get(id).api ?? {});
      return Object.fromEntries(entries.map(([key, value]) => [key, typeof value]));
    }, MODULE_ID);
    expect(api).toMatchObject({
      version: 'string',
      openAwardXp: 'function',
      awardXp: 'function',
      sparklePCs: 'function',
    });
  });
});
