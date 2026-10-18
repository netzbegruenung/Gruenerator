/**
 * Sticker und Hintergründe: der Studio-Shop (`listStudioAssets`), der Likes,
 * „gemerkt" und Autor schon in seiner eigenen Abfrage liest.
 */
import { type MarketplaceItemOf, type StudioAssetItem } from '@gruenerator/contracts';

import { favoriteEntity, unfavoriteEntity } from '../../entityFavorites/EntityFavoritesService.js';
import {
  getStudioAsset,
  isStudioAssetVisible,
  listStudioAssets,
} from '../../studioAssets/studioAssetsService.js';
import { favoritedAmong } from '../enrich.js';

import type { MarketplaceSource } from './types.js';

type AssetKind = 'sticker' | 'background';

function toItem<K extends AssetKind>(kind: K, asset: StudioAssetItem): MarketplaceItemOf<K> {
  // Boundary cast: `kind` and `asset.kind` agree (the query filters on it), but
  // TS cannot narrow a generic object literal to one member of the union.
  return {
    kind,
    key: `${kind}:${asset.id}`,
    ref: asset.id,
    origin: 'oeffentlich',
    title: asset.title,
    description: null,
    thumbnailUrl: asset.thumbUrl,
    iconKey: null,
    authorName: asset.authorName,
    audience: asset.audience,
    likesCount: asset.likesCount,
    liked: asset.liked,
    saved: asset.favorited,
    isOwn: asset.isOwn,
    reportKind: 'studio_asset',
    createdAt: asset.createdAt,
    asset,
  } as MarketplaceItemOf<K>;
}

export function studioAssetSource<K extends AssetKind>(kind: K): MarketplaceSource<K> {
  return {
    kind,
    likeType: 'studio_asset',
    reportKind: 'studio_asset',
    async list(ctx, query) {
      if (query.origin !== null && query.origin !== 'oeffentlich') {
        return { items: [], hasMore: false };
      }
      const page = await listStudioAssets(ctx.userId, ctx.audience, {
        kind,
        scope: query.scope === 'saved' ? 'saved' : 'shop',
        ...(query.q && { q: query.q }),
        sort: query.sort === 'neu' ? 'new' : 'popular',
        offset: query.offset,
        limit: query.limit,
      });
      return { items: page.items.map((a) => toItem(kind, a)), hasMore: page.hasMore };
    },
    isVisible: (ctx, ref) => isStudioAssetVisible(ctx.userId, ref, { kind, locale: ctx.audience }),
    async get(ctx, ref) {
      // The asset reader alone does not know the shop's kind and country rule.
      if (!(await isStudioAssetVisible(ctx.userId, ref, { kind, locale: ctx.audience })))
        return null;
      const asset = await getStudioAsset(ctx.userId, ref);
      return asset ? toItem(kind, asset) : null;
    },
    save: {
      has: (ctx, refs) => favoritedAmong(ctx.userId, 'studio_asset', refs),
      async add(ctx, ref) {
        await favoriteEntity({ userId: ctx.userId, entityType: 'studio_asset', entityId: ref });
        return 'ok';
      },
      async remove(ctx, ref) {
        await unfavoriteEntity({ userId: ctx.userId, entityType: 'studio_asset', entityId: ref });
      },
    },
  };
}
