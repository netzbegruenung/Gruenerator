/**
 * Sticker/Hintergründe im Papierkorb. Trash touches only `deleted_at`; the
 * purge removes the row first, then likes, favorites and — only for assets
 * that were never public — the image file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
const params: unknown[][] = [];
let deleted: unknown[] = [];
const reportBackgroundError = vi.fn();
const deleteLikesForEntity = vi.fn(async (type: string, id: string) => {
  effects.push(`likes ${type} ${id}`);
});
const deleteFavoritesForEntity = vi.fn(async (type: string, id: string) => {
  effects.push(`favorites ${type} ${id}`);
});
const purgeInternalShare = vi.fn(async (token: string, owner: string | null) => {
  effects.push(`media ${token} ${owner}`);
  return true;
});

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: vi.fn(async (sql: string, p: unknown[]) => {
      effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
      params.push(p);
      return sql.startsWith('DELETE') ? deleted : [{ id: 'kept' }];
    }),
  }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));
vi.mock('../entityLikes/EntityLikesService.js', () => ({ deleteLikesForEntity }));
vi.mock('../entityFavorites/EntityFavoritesService.js', () => ({ deleteFavoritesForEntity }));
vi.mock('../sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ purgeInternalShare }),
}));

const { purgeStudioAsset, trashStudioAssets } = await import('./studioAssetTrash.js');

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';
const SRC = '/api/share/tok123/download';

beforeEach(() => {
  effects.length = 0;
  params.length = 0;
  deleted = [];
  reportBackgroundError.mockClear();
  purgeInternalShare.mockClear();
});

describe('studio asset Papierkorb', () => {
  it('trash only sets deleted_at on own assets and skips non-uuid ids', async () => {
    expect(await trashStudioAssets(USER, [ID, 'kaputt'])).toEqual(['kept']);
    expect(effects).toEqual(['UPDATE studio_assets SET deleted_at = now()']);
    expect(params[0]).toEqual([USER, [ID]]);
    expect(purgeInternalShare).not.toHaveBeenCalled();
  });

  it('purge of a never-public asset removes row, likes, favorites and the file', async () => {
    deleted = [{ id: ID, user_id: USER, src: SRC, was_public: false }];
    const cutoff = new Date('2026-10-01T00:00:00Z');
    expect(await purgeStudioAsset(ID, cutoff)).toBe(true);
    expect(effects).toEqual([
      'DELETE FROM studio_assets',
      `likes studio_asset ${ID}`,
      `favorites studio_asset ${ID}`,
      `media tok123 ${USER}`,
    ]);
    expect(params[0]).toEqual([ID, cutoff]);
  });

  it('purge of an ever-public asset keeps the file', async () => {
    deleted = [{ id: ID, user_id: USER, src: SRC, was_public: true }];
    expect(await purgeStudioAsset(ID, null)).toBe(true);
    expect(effects).toEqual([
      'DELETE FROM studio_assets',
      `likes studio_asset ${ID}`,
      `favorites studio_asset ${ID}`,
    ]);
    expect(purgeInternalShare).not.toHaveBeenCalled();
  });

  it('touches no side store when the row was restored meanwhile (0 rows)', async () => {
    expect(await purgeStudioAsset(ID, null)).toBe(false);
    expect(effects).toEqual(['DELETE FROM studio_assets']);
  });

  it('reports a failing side store and still purges the rest', async () => {
    deleted = [{ id: ID, user_id: USER, src: SRC, was_public: false }];
    deleteLikesForEntity.mockRejectedValueOnce(new Error('db down'));
    expect(await purgeStudioAsset(ID, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'studio_asset', store: 'entity_likes' })
    );
    expect(purgeInternalShare).toHaveBeenCalled();
  });
});
