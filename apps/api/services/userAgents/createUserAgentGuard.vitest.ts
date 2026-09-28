import { describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({ insert }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { createUserAgent } = await import('./userAgentsRepository.js');

/** The chat tool and MCP create paths skip the HTTP contract; the repository refuses too. */
describe('createUserAgent', () => {
  it('refuses a uuid-shaped identifier before touching the database', async () => {
    await expect(
      createUserAgent('11111111-1111-4111-8111-111111111111', {
        identifier: '22222222-2222-4222-8222-222222222222',
      } as Parameters<typeof createUserAgent>[1])
    ).rejects.toThrow('UUID');
    expect(insert).not.toHaveBeenCalled();
  });
});
