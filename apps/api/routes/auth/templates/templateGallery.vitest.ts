/**
 * GET /vorlagen filtert auf das eigene Land; `land` wechselt es nur für
 * Instanz-Admins, ein unbekannter Wert wird wie ein fehlender behandelt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const m = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../../utils/adminAuthz.js', () => ({ isInstanceAdmin: m.isInstanceAdmin }));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: vi.fn(), query: m.query }),
}));
vi.mock('../../../services/entityLikes/EntityLikesService.js', () => ({
  getLikeCountsForEntities: vi.fn(async () => new Map()),
}));
vi.mock('../../../services/entityFavorites/EntityFavoritesService.js', () => ({
  getFavoritedEntityIdsForUser: vi.fn(),
}));

const { default: router } = await import('./templateGallery.js');

type Layer = { route?: { path: string; stack: Array<{ handle: Function }> } };
const route = (router as unknown as { stack: Layer[] }).stack.find(
  (l) => l.route?.path === '/vorlagen'
)!.route!;
const handler = route.stack[route.stack.length - 1]!.handle as (
  req: Request,
  res: Response
) => Promise<void>;

/** The audience the gallery query was filtered on. */
async function audienceFor(query: Record<string, string>): Promise<unknown> {
  const req = { user: { id: 'viewer', locale: 'de-DE' }, headers: {}, query };
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
  await handler(req as unknown as Request, res as unknown as Response);
  expect(res.json).toHaveBeenCalledWith({ success: true, vorlagen: [] });
  const [sql, params] = m.query.mock.calls.at(-1) as [string, unknown[]];
  expect(sql).toContain("audience IN ($3, 'all')");
  return params[2];
}

beforeEach(() => {
  vi.clearAllMocks();
  m.query.mockResolvedValue([]);
});

describe('GET /vorlagen', () => {
  it('filters on the viewer country by default', async () => {
    expect(await audienceFor({})).toBe('de-DE');
  });

  it('filters on the other country for an instance admin', async () => {
    m.isInstanceAdmin.mockResolvedValue(true);
    expect(await audienceFor({ land: 'de-AT' })).toBe('de-AT');
  });

  it('ignores `land` for a non-admin', async () => {
    m.isInstanceAdmin.mockResolvedValue(false);
    expect(await audienceFor({ land: 'de-AT' })).toBe('de-DE');
  });

  it('ignores an unknown `land` without asking', async () => {
    expect(await audienceFor({ land: 'xx' })).toBe('de-DE');
    expect(m.isInstanceAdmin).not.toHaveBeenCalled();
  });
});
