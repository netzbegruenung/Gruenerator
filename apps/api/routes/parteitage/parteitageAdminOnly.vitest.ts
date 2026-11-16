/** While PARTEITAGE_ADMIN_ONLY is on, non-admins get 404 on every door; admins pass. */
import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const m = vi.hoisted(() => ({
  viewerFromRequest: vi.fn(),
  getConventionBySlug: vi.fn(),
  findOwnerOfMedia: vi.fn(),
  hasGrant: vi.fn(),
  getMedia: vi.fn(),
  stat: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock('../../services/parteitage/access.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/access.js')>()),
  viewerFromRequest: m.viewerFromRequest,
}));
vi.mock('../../services/parteitage/parteitageRepository.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/parteitageRepository.js')>()),
  getConventionBySlug: m.getConventionBySlug,
  findOwnerOfMedia: m.findOwnerOfMedia,
  hasGrant: m.hasGrant,
  listSpeeches: async () => [],
}));
vi.mock('../../services/parteitage/parteitageViews.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/parteitageViews.js')>()),
  getMedia: m.getMedia,
}));
vi.mock('../../services/systemMedia/storage.js', () => ({
  getSystemMediaStorage: () => ({ stat: m.stat, openRead: () => new PassThrough() }),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => {
    const chain: Record<string, unknown> = {};
    for (const k of ['from', 'leftJoin', 'groupBy', 'where']) chain[k] = () => chain;
    chain.orderBy = async () => m.rows;
    (chain as { then?: unknown }).then = (res: (v: unknown[]) => void) => res([]);
    return { select: () => chain };
  },
}));

const { parteitageContractRouter } = await import('./parteitageContractRouter.js');
const { parteitageMediaHandler } = await import('./parteitageMediaRouter.js');

type Handler = (args: Record<string, unknown>) => Promise<{ status: number }>;
const call = (name: string, args: Record<string, unknown> = {}) =>
  (parteitageContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'u1' }, headers: {} } as unknown as Request,
    ...args,
  });

const convention = {
  id: 'c1',
  slug_name: 'LDK Essen',
  slug_suffix: 'abc123',
  title: 'LDK',
  short_title: 'LDK',
  organizer: 'o',
  audience: 'all',
  starts_on: '2026-01-01',
  ends_on: '2026-01-02',
  location: 'Essen',
  status: 'published',
  access_password_hash: null,
  stats: null,
  source_links: [],
  report_media_id: null,
};

const runMedia = async () => {
  const res = { headersSent: false, status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await parteitageMediaHandler(
    { params: { mediaId: 'm1' }, query: {}, headers: {} } as unknown as Request,
    res as unknown as Response
  );
  return res;
};

const asViewer = (isAdmin: boolean) =>
  m.viewerFromRequest.mockResolvedValue({ userId: 'u1', isAdmin, audience: 'de-DE' });

beforeEach(() => {
  vi.clearAllMocks();
  m.rows = [{ convention, speechCount: 0 }];
  m.getConventionBySlug.mockResolvedValue(convention);
  m.findOwnerOfMedia.mockResolvedValue({ convention, speech: null });
  m.hasGrant.mockResolvedValue(true);
  m.getMedia.mockResolvedValue({ storage_key: 'k/r.pdf', mime_type: 'application/pdf' });
  m.stat.mockResolvedValue({ size: 3 });
});

describe('parteitage admin-only gate', () => {
  it('non-admin: list is empty, get/unlock/media are 404', async () => {
    asViewer(false);
    const list = (await call('list')) as unknown as { body: { conventions: unknown[] } };
    expect(list.body.conventions).toEqual([]);
    expect((await call('get', { params: { slug: 'x' } })).status).toBe(404);
    expect((await call('unlock', { params: { slug: 'x' }, body: { password: 'p' } })).status).toBe(
      404
    );
    expect((await runMedia()).status).toHaveBeenCalledWith(404);
  });

  it('admin: list shows the convention; get and media pass the access check', async () => {
    asViewer(true);
    const list = (await call('list')) as unknown as { body: { conventions: unknown[] } };
    expect(list.body.conventions).toHaveLength(1);
    // Admins get past the access check (the sparse fixture may still fail to render).
    expect((await call('get', { params: { slug: 'x' } })).status).not.toBe(404);
    expect((await runMedia()).status).not.toHaveBeenCalledWith(404);
  });
});
