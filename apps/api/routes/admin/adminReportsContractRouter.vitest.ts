import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const listReportGroups = vi.fn();
const resolveReports = vi.fn();
const countOpenReportTargets = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));
vi.mock('../../services/contentReports/contentReportsService.js', () => ({
  listReportGroups,
  resolveReports,
  countOpenReportTargets,
}));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;
const resolveBody = { kind: 'studio_asset', targetId: 'a-1', action: 'remove' } as const;

async function loadRouter() {
  const mod = await import('./adminReportsContractRouter.js');
  return mod.adminReportsContractRouter;
}

beforeEach(() => {
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  listReportGroups.mockReset().mockResolvedValue([]);
  resolveReports.mockReset().mockResolvedValue({
    ok: true,
    value: { resolved: 2, moderation: 'removed' },
  });
  countOpenReportTargets.mockReset().mockResolvedValue(4);
});

describe('adminReportsContractRouter', () => {
  it('refuses every route to non-admins before touching the reports', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const router = await loadRouter();
    const results = await Promise.all([
      router.list({ req, query: { status: 'open' } } as never),
      router.resolve({ req, body: resolveBody } as never),
      router.stats({ req } as never),
    ]);
    for (const res of results) expect(res.status).toBe(403);
    expect(requireInstanceAdmin).toHaveBeenCalledWith('admin-1', 'admin@example.org');
    expect(listReportGroups).not.toHaveBeenCalled();
    expect(resolveReports).not.toHaveBeenCalled();
    expect(countOpenReportTargets).not.toHaveBeenCalled();
  });

  it('lists the groups for the query', async () => {
    const router = await loadRouter();
    const res = await router.list({
      req,
      query: { status: 'dismissed', kind: 'studio_asset' },
    } as never);
    expect(res).toEqual({ status: 200, body: { reports: [] } });
    expect(listReportGroups).toHaveBeenCalledWith({ status: 'dismissed', kind: 'studio_asset' });
  });

  it('resolves as the signed-in admin and passes service refusals through', async () => {
    const router = await loadRouter();
    expect(await router.resolve({ req, body: resolveBody } as never)).toEqual({
      status: 200,
      body: { resolved: 2, moderation: 'removed' },
    });
    expect(resolveReports).toHaveBeenCalledWith('admin-1', resolveBody);

    resolveReports.mockResolvedValue({ ok: false, status: 404, message: 'weg' });
    expect(await router.resolve({ req, body: resolveBody } as never)).toEqual({
      status: 404,
      body: { success: false, message: 'weg' },
    });
  });

  it('counts open targets and answers 500 when the service throws', async () => {
    const router = await loadRouter();
    expect(await router.stats({ req } as never)).toEqual({ status: 200, body: { open: 4 } });
    countOpenReportTargets.mockRejectedValue(new Error('db down'));
    expect((await router.stats({ req } as never)).status).toBe(500);
  });
});
