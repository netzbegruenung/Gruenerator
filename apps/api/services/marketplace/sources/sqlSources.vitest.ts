/**
 * Vorlagen und Studio-Assets filtern in ihrer eigenen Abfrage: geprüft wird,
 * was die Quellen der Abfrage mitgeben (Land, Sortierung, Seite, Merkliste)
 * und wie sie die Zeile abbilden. Die Abfragen selbst laufen in
 * `marketplaceService.db.vitest.ts` gegen Postgres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceQuery } from './types.js';

const m = vi.hoisted(() => ({
  listGalleryTemplates: vi.fn(),
  listStudioAssets: vi.fn(),
  isStudioAssetVisible: vi.fn(),
  getStudioAsset: vi.fn(),
  getFavoritedEntityIdsForUser: vi.fn(),
  favoriteEntity: vi.fn(),
  unfavoriteEntity: vi.fn(),
  enrichItems: vi.fn(async (_c: unknown, _s: unknown, items: unknown[]) => items),
  favoritedAmong: vi.fn(),
}));

vi.mock('../../templates/galleryTemplates.js', () => ({
  listGalleryTemplates: m.listGalleryTemplates,
}));
vi.mock('../../studioAssets/studioAssetsService.js', () => ({
  listStudioAssets: m.listStudioAssets,
  isStudioAssetVisible: m.isStudioAssetVisible,
  getStudioAsset: m.getStudioAsset,
}));
vi.mock('../../entityFavorites/EntityFavoritesService.js', () => ({
  getFavoritedEntityIdsForUser: m.getFavoritedEntityIdsForUser,
  favoriteEntity: m.favoriteEntity,
  unfavoriteEntity: m.unfavoriteEntity,
}));
vi.mock('../enrich.js', () => ({ enrichItems: m.enrichItems, favoritedAmong: m.favoritedAmong }));

const { templateSource } = await import('./templateSource.js');
const { studioAssetSource } = await import('./studioAssetSource.js');

const ID = '00000000-0000-4000-8000-0000000000dd';

const ctx = (audience: 'de-DE' | 'de-AT' = 'de-AT') => ({
  userId: 'viewer',
  audience,
  instanceId: 'production' as const,
  platform: 'web' as const,
  officialCatalog: vi.fn(),
  resolvableCatalog: vi.fn(),
});

const query = (o: Partial<SourceQuery> = {}): SourceQuery => ({
  origin: null,
  q: null,
  sort: 'empfohlen',
  scope: 'shop',
  offset: 0,
  limit: 2,
  systemRecipes: false,
  ...o,
});

const row = (id: string) => ({
  id,
  userId: 'viewer',
  title: 'Plakat',
  description: '',
  templateType: 'canva',
  thumbnailUrl: null,
  externalUrl: 'https://example.org',
  images: [{ url: '/share/abc', title: 'Seite 1' }, { nope: true }],
  categories: [],
  tags: ['klima'],
  contentData: {},
  metadata: {},
  audience: 'de-AT',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  authorName: 'Kim',
  likesCount: 4,
});

beforeEach(() => vi.clearAllMocks());

describe('templateSource', () => {
  it('asks for the viewer’s country, most liked first, one extra row for hasMore', async () => {
    m.listGalleryTemplates.mockResolvedValue([row(ID), row('b'), row('c')]);
    const page = await templateSource.list(ctx(), query({ q: 'plakat', offset: 4 }));
    expect(m.listGalleryTemplates).toHaveBeenCalledWith({
      audience: 'de-AT',
      searchTerm: 'plakat',
      searchMode: 'fulltext',
      sort: 'popular',
      offset: 4,
      limit: 3,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      ref: ID,
      origin: 'oeffentlich',
      reportKind: 'user_template',
      isOwn: true,
      likesCount: 4,
      description: null,
      thumbnailUrl: '/share/abc',
      template: { images: [{ url: '/share/abc', title: 'Seite 1' }], tags: ['klima'] },
    });
    expect(m.enrichItems).toHaveBeenCalledWith(expect.anything(), templateSource, page.items, {
      counts: false,
    });
  });

  it('neu sorts by age', async () => {
    m.listGalleryTemplates.mockResolvedValue([]);
    await templateSource.list(ctx(), query({ sort: 'neu' }));
    expect(m.listGalleryTemplates).toHaveBeenCalledWith(expect.objectContaining({ sort: 'new' }));
  });

  it('has nothing official and nothing from a Landesverband', async () => {
    for (const origin of ['offiziell', 'landesverband'] as const) {
      expect(await templateSource.list(ctx(), query({ origin }))).toEqual({
        items: [],
        hasMore: false,
      });
    }
    expect(m.listGalleryTemplates).not.toHaveBeenCalled();
  });

  it('saved scope reads the bookmarks, and stops early without any', async () => {
    m.getFavoritedEntityIdsForUser.mockResolvedValue([]);
    expect((await templateSource.list(ctx(), query({ scope: 'saved' }))).items).toEqual([]);
    expect(m.listGalleryTemplates).not.toHaveBeenCalled();

    m.getFavoritedEntityIdsForUser.mockResolvedValue([ID, 'system-vorlage']);
    m.listGalleryTemplates.mockResolvedValue([]);
    await templateSource.list(ctx(), query({ scope: 'saved' }));
    expect(m.listGalleryTemplates).toHaveBeenCalledWith(expect.objectContaining({ ids: [ID] }));
  });

  it('is visible only as a published gallery row of the viewer’s country', async () => {
    expect(await templateSource.isVisible(ctx(), 'kein-uuid')).toBe(false);
    m.listGalleryTemplates.mockResolvedValue([row(ID)]);
    expect(await templateSource.isVisible(ctx('de-DE'), ID)).toBe(true);
    expect(m.listGalleryTemplates).toHaveBeenCalledWith({
      audience: 'de-DE',
      ids: [ID],
      limit: 1,
    });
  });
});

describe('templateSource.get', () => {
  it('builds the item from the gallery row of the viewer’s country', async () => {
    expect(await templateSource.get(ctx(), 'kein-uuid')).toBeNull();
    expect(m.listGalleryTemplates).not.toHaveBeenCalled();

    m.listGalleryTemplates.mockResolvedValue([row(ID)]);
    const item = await templateSource.get(ctx('de-DE'), ID);
    expect(m.listGalleryTemplates).toHaveBeenCalledWith({ audience: 'de-DE', ids: [ID], limit: 1 });
    expect(item).toMatchObject({ kind: 'template', ref: ID, likesCount: 4 });
    expect(item?.template.images).toEqual([{ url: '/share/abc', title: 'Seite 1' }]);
    expect(m.enrichItems).toHaveBeenCalledWith(expect.anything(), templateSource, [item], {
      counts: false,
    });

    m.listGalleryTemplates.mockResolvedValue([]);
    expect(await templateSource.get(ctx(), ID)).toBeNull();
  });
});

describe('studioAssetSource', () => {
  const asset = {
    id: ID,
    kind: 'background',
    title: 'Wiese',
    tags: [],
    src: '/api/share/t/download',
    thumbUrl: '/thumb',
    width: 1080,
    height: 1080,
    source: 'upload',
    visibility: 'public',
    audience: 'all',
    moderation: 'ok',
    isOwn: false,
    authorName: 'Kim',
    likesCount: 2,
    liked: true,
    favorited: true,
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  it('wraps the studio shop for its kind and carries its likes and bookmark', async () => {
    m.listStudioAssets.mockResolvedValue({ items: [asset], hasMore: true });
    const page = await studioAssetSource('background').list(
      ctx(),
      query({ sort: 'neu', q: 'wiese', scope: 'saved' })
    );
    expect(m.listStudioAssets).toHaveBeenCalledWith('viewer', 'de-AT', {
      kind: 'background',
      scope: 'saved',
      q: 'wiese',
      sort: 'new',
      offset: 0,
      limit: 2,
    });
    expect(page).toEqual({
      hasMore: true,
      items: [
        expect.objectContaining({
          kind: 'background',
          key: `background:${ID}`,
          origin: 'oeffentlich',
          likesCount: 2,
          liked: true,
          saved: true,
          reportKind: 'studio_asset',
          thumbnailUrl: '/thumb',
          asset,
        }),
      ],
    });
  });

  it('gets one asset only through the shop’s kind and country rule', async () => {
    m.isStudioAssetVisible.mockResolvedValue(false);
    expect(await studioAssetSource('background').get(ctx(), ID)).toBeNull();
    expect(m.isStudioAssetVisible).toHaveBeenCalledWith('viewer', ID, {
      kind: 'background',
      locale: 'de-AT',
    });
    expect(m.getStudioAsset).not.toHaveBeenCalled();

    m.isStudioAssetVisible.mockResolvedValue(true);
    m.getStudioAsset.mockResolvedValue(asset);
    expect(await studioAssetSource('background').get(ctx(), ID)).toMatchObject({
      kind: 'background',
      ref: ID,
      liked: true,
      saved: true,
      asset,
    });
  });

  it('empfohlen and beliebt rank by likes', async () => {
    m.listStudioAssets.mockResolvedValue({ items: [], hasMore: false });
    await studioAssetSource('sticker').list(ctx(), query({ sort: 'empfohlen' }));
    expect(m.listStudioAssets).toHaveBeenCalledWith(
      'viewer',
      'de-AT',
      expect.objectContaining({ kind: 'sticker', scope: 'shop', sort: 'popular' })
    );
  });
});
