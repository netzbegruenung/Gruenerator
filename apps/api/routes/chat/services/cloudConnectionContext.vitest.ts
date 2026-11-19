import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getShareLinks, listConnections } = vi.hoisted(() => ({
  getShareLinks: vi.fn(),
  listConnections: vi.fn(),
}));

vi.mock('../../../utils/integrations/nextcloud/shareManager.js', () => ({
  NextcloudShareManager: { getShareLinks },
}));
vi.mock('../../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { listConnections },
}));

import { countCloudConnections, resetCloudConnectionCache } from './cloudConnectionContext.js';

const status = (provider: string, connected: boolean) => ({ provider, connected });

describe('countCloudConnections', () => {
  beforeEach(() => {
    resetCloudConnectionCache();
    getShareLinks.mockReset().mockResolvedValue([]);
    listConnections.mockReset().mockResolvedValue([]);
  });

  it('counts active share links and connected Microsoft/Google accounts', async () => {
    getShareLinks.mockResolvedValue([{ is_active: true }, { is_active: false }]);
    listConnections.mockResolvedValue([
      status('microsoft', true),
      status('google', true),
      status('jira', true),
    ]);
    expect(await countCloudConnections('u1')).toBe(3);
  });

  it('ignores disconnected accounts', async () => {
    listConnections.mockResolvedValue([status('microsoft', false), status('google', false)]);
    expect(await countCloudConnections('u1')).toBe(0);
  });

  it('counts a OneDrive-only account', async () => {
    listConnections.mockResolvedValue([status('microsoft', true)]);
    expect(await countCloudConnections('u1')).toBe(1);
  });

  it('survives a Nango failure: the share links still count, nothing throws', async () => {
    getShareLinks.mockResolvedValue([{ is_active: true }]);
    listConnections.mockRejectedValue(new Error('nango down'));
    expect(await countCloudConnections('u1')).toBe(1);
  });

  it('survives a database failure: the Drive accounts still count', async () => {
    getShareLinks.mockRejectedValue(new Error('db down'));
    listConnections.mockResolvedValue([status('google', true)]);
    expect(await countCloudConnections('u1')).toBe(1);
  });

  it('returns 0 when both fail, and does not cache the failure', async () => {
    getShareLinks.mockRejectedValue(new Error('db'));
    listConnections.mockRejectedValue(new Error('nango'));
    expect(await countCloudConnections('u1')).toBe(0);
    listConnections.mockResolvedValue([status('microsoft', true)]);
    getShareLinks.mockResolvedValue([]);
    expect(await countCloudConnections('u1')).toBe(1);
  });

  it('caches a clean answer', async () => {
    listConnections.mockResolvedValue([status('microsoft', true)]);
    await countCloudConnections('u1');
    await countCloudConnections('u1');
    expect(listConnections).toHaveBeenCalledTimes(1);
  });
});
