/**
 * Likes/Merken nur auf sichtbare Sticker/Hintergründe (404, nichts geschrieben);
 * Entfernen bleibt möglich. Service-Fehler kommen mit ihrem Status an.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  isStudioAssetVisible: vi.fn(),
  listStudioAssets: vi.fn(),
  createStudioAsset: vi.fn(),
  updateStudioAsset: vi.fn(),
  removeStudioAsset: vi.fn(),
  likeEntity: vi.fn(),
  unlikeEntity: vi.fn(),
  favoriteEntity: vi.fn(),
  unfavoriteEntity: vi.fn(),
}));

vi.mock('../../services/studioAssets/studioAssetsService.js', () => ({
  isStudioAssetVisible: m.isStudioAssetVisible,
  listStudioAssets: m.listStudioAssets,
  createStudioAsset: m.createStudioAsset,
  updateStudioAsset: m.updateStudioAsset,
  removeStudioAsset: m.removeStudioAsset,
}));
vi.mock('../../services/entityLikes/EntityLikesService.js', () => ({
  likeEntity: m.likeEntity,
  unlikeEntity: m.unlikeEntity,
}));
vi.mock('../../services/entityFavorites/EntityFavoritesService.js', () => ({
  favoriteEntity: m.favoriteEntity,
  unfavoriteEntity: m.unfavoriteEntity,
}));

const { studioAssetsContractRouter } = await import('./studioAssetsContractRouter.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const call = (name: string, args: Record<string, unknown> = {}) =>
  (studioAssetsContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'viewer' }, headers: {} } as unknown as Request,
    ...args,
  });

const ID = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  m.likeEntity.mockResolvedValue({ liked: true, count: 3, createdNew: true });
  m.unlikeEntity.mockResolvedValue({ liked: false, count: 2 });
});

describe.each([
  ['like', m.likeEntity, { liked: true, likesCount: 3 }],
  ['favorite', m.favoriteEntity, { favorited: true }],
] as const)('%s', (name, write, body) => {
  it('writes for a visible asset', async () => {
    m.isStudioAssetVisible.mockResolvedValue(true);
    const res = await call(name, { params: { id: ID } });
    expect(res).toEqual({ status: 200, body });
    expect(write).toHaveBeenCalledWith({
      userId: 'viewer',
      entityType: 'studio_asset',
      entityId: ID,
    });
  });

  it('404 for an invisible asset, nothing written', async () => {
    m.isStudioAssetVisible.mockResolvedValue(false);
    const res = await call(name, { params: { id: ID } });
    expect(res.status).toBe(404);
    expect(m.isStudioAssetVisible).toHaveBeenCalledWith('viewer', ID);
    expect(write).not.toHaveBeenCalled();
  });
});

it.each([
  [true, 2],
  [false, 0],
])(
  'unlike always removes the like; the count shows only when visible (%s)',
  async (visible, likesCount) => {
    m.isStudioAssetVisible.mockResolvedValue(visible);
    const res = await call('unlike', { params: { id: ID } });
    expect(res).toEqual({ status: 200, body: { liked: false, likesCount } });
    expect(m.unlikeEntity).toHaveBeenCalledWith({
      userId: 'viewer',
      entityType: 'studio_asset',
      entityId: ID,
    });
  }
);

it('list passes the viewer country', async () => {
  m.listStudioAssets.mockResolvedValue({ items: [], hasMore: false });
  const query = { kind: 'sticker', scope: 'shop', sort: 'new', offset: 0, limit: 48 };
  await call('list', {
    req: { user: { id: 'viewer', locale: 'de-AT' }, headers: {} },
    query,
  });
  expect(m.listStudioAssets).toHaveBeenCalledWith('viewer', 'de-AT', query);
});

it('create forwards the service status and message', async () => {
  m.createStudioAsset.mockResolvedValue({ ok: false, status: 409, message: 'schon verwendet' });
  const res = await call('create', { body: { shareToken: 't' } });
  expect(res).toEqual({ status: 409, body: { success: false, message: 'schon verwendet' } });
});

it('remove answers 404 when nothing was trashed', async () => {
  m.removeStudioAsset.mockResolvedValue(false);
  expect((await call('remove', { params: { id: ID } })).status).toBe(404);
  m.removeStudioAsset.mockResolvedValue(true);
  expect(await call('remove', { params: { id: ID } })).toEqual({
    status: 200,
    body: { trashed: true },
  });
});
