import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionService } from '../../../services/connections/ConnectionService.js';

import {
  getAtlassianConnections,
  resetAtlassianConnectionCache,
} from './atlassianConnectionContext.js';

vi.mock('../../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { listConnections: vi.fn() },
}));

const list = vi.mocked(ConnectionService.listConnections);

beforeEach(() => {
  resetAtlassianConnectionCache();
  list.mockReset();
});

describe('getAtlassianConnections', () => {
  it('reports which products are connected and caches the answer', async () => {
    list.mockResolvedValue([
      { provider: 'jira', connected: true },
      { provider: 'confluence', connected: false },
    ] as Awaited<ReturnType<typeof ConnectionService.listConnections>>);
    expect(await getAtlassianConnections('u1')).toEqual({ jira: true, confluence: false });
    await getAtlassianConnections('u1');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('treats a lookup failure as not connected and does not cache it', async () => {
    list.mockRejectedValueOnce(new Error('nango down'));
    expect(await getAtlassianConnections('u2')).toEqual({ jira: false, confluence: false });
    list.mockResolvedValue([{ provider: 'jira', connected: true }] as Awaited<
      ReturnType<typeof ConnectionService.listConnections>
    >);
    expect((await getAtlassianConnections('u2')).jira).toBe(true);
  });
});
