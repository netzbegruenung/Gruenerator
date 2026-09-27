import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();

vi.mock('@gruenerator/shared/api', () => ({
  apiRequest: vi.fn(),
  getContractsClient: () => ({ canvas: { list } }),
}));

vi.mock('../devFixtures', () => ({
  DEV_FIXTURES_ENABLED: false,
  DEV_BOARDS: [],
  DEV_CANVASES: [],
}));

const { officeApi } = await import('./officeApi');

/**
 * The Studio tab renders "noch nichts erstellt" for an empty list and an error
 * state for a failed load. `fetchCanvases` used to answer `?? []` for both, so a
 * failed request was shown to the user as an invitation to create their first
 * canvas — with their existing canvases merely unloaded.
 */
describe('fetchCanvases', () => {
  beforeEach(() => {
    list.mockReset();
  });

  it('returns the canvases on 200', async () => {
    list.mockResolvedValue({ status: 200, body: [{ id: 'c1' }] });

    await expect(officeApi.fetchCanvases()).resolves.toEqual([{ id: 'c1' }]);
  });

  it('passes an empty list through as an empty list', async () => {
    list.mockResolvedValue({ status: 200, body: [] });

    await expect(officeApi.fetchCanvases()).resolves.toEqual([]);
  });

  it('throws on a failure instead of faking an empty studio', async () => {
    list.mockResolvedValue({ status: 500, body: { error: 'kaputt' } });

    await expect(officeApi.fetchCanvases()).rejects.toThrow(/500/);
  });

  it('throws on 401 rather than reporting "nothing created yet"', async () => {
    list.mockResolvedValue({ status: 401, body: { error: 'nope' } });

    await expect(officeApi.fetchCanvases()).rejects.toThrow(/401/);
  });
});
