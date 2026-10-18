/**
 * Vorlagen: nur die veröffentlichten Community-Vorlagen (`user_templates`).
 * Der System-Katalog und die Print-Vorlagen bleiben auf `/vorlagen`. Herkunft
 * ist deshalb immer „öffentlich". Filter, Sortierung und Seite macht die
 * Abfrage selbst (`listGalleryTemplates`); hier kommen nur `liked`/`saved` dazu.
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';

import {
  favoriteEntity,
  getFavoritedEntityIdsForUser,
  unfavoriteEntity,
} from '../../entityFavorites/EntityFavoritesService.js';
import { isUserTemplateId } from '../../templateInteractions/templateTarget.js';
import { listGalleryTemplates, type GalleryTemplateRow } from '../../templates/galleryTemplates.js';
import { type MarketplaceContext } from '../context.js';
import { enrichItems, favoritedAmong } from '../enrich.js';

import type { MarketplaceSource } from './types.js';

type TemplateItem = MarketplaceItemOf<'template'>;

function toImages(raw: unknown[]): TemplateItem['template']['images'] {
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { url, title } = entry as { url?: unknown; title?: unknown };
    if (typeof url !== 'string' || url.length === 0) return [];
    return [{ url, title: typeof title === 'string' ? title : null }];
  });
}

function toItem(ctx: MarketplaceContext, row: GalleryTemplateRow): TemplateItem {
  const images = toImages(row.images);
  return {
    kind: 'template',
    key: `template:${row.id}`,
    ref: row.id,
    origin: 'oeffentlich',
    title: row.title,
    description: row.description || null,
    thumbnailUrl: row.thumbnailUrl || images[0]?.url || null,
    iconKey: null,
    authorName: row.authorName,
    audience: row.audience,
    likesCount: row.likesCount,
    liked: false,
    saved: false,
    isOwn: row.userId === ctx.userId,
    reportKind: 'user_template',
    createdAt: row.createdAt.toISOString(),
    template: {
      templateType: row.templateType,
      externalUrl: row.externalUrl,
      images,
      categories: row.categories,
      tags: row.tags,
      contentData: row.contentData,
      metadata: row.metadata,
    },
  };
}

export const templateSource: MarketplaceSource<'template'> = {
  kind: 'template',
  likeType: 'template',
  reportKind: 'user_template',
  async list(ctx, query) {
    if (query.origin !== null && query.origin !== 'oeffentlich')
      return { items: [], hasMore: false };

    let ids: string[] | undefined;
    if (query.scope === 'saved') {
      ids = (
        await getFavoritedEntityIdsForUser({ userId: ctx.userId, entityType: 'template' })
      ).filter(isUserTemplateId);
      if (ids.length === 0) return { items: [], hasMore: false };
    }

    const rows = await listGalleryTemplates({
      audience: ctx.audience,
      ...(ids && { ids }),
      ...(query.q && { searchTerm: query.q, searchMode: 'fulltext' }),
      sort: query.sort === 'neu' ? 'new' : 'popular',
      offset: query.offset,
      limit: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map((row) => toItem(ctx, row));
    await enrichItems(ctx, templateSource, items, { counts: false });
    return { items, hasMore: rows.length > query.limit };
  },
  async isVisible(ctx, ref) {
    if (!isUserTemplateId(ref)) return false;
    const rows = await listGalleryTemplates({ audience: ctx.audience, ids: [ref], limit: 1 });
    return rows.length > 0;
  },
  async get(ctx, ref) {
    if (!isUserTemplateId(ref)) return null;
    const [row] = await listGalleryTemplates({ audience: ctx.audience, ids: [ref], limit: 1 });
    if (!row) return null;
    const [item] = await enrichItems(ctx, templateSource, [toItem(ctx, row)], { counts: false });
    return item ?? null;
  },
  save: {
    has: (ctx, refs) => favoritedAmong(ctx.userId, 'template', refs),
    async add(ctx, ref) {
      await favoriteEntity({ userId: ctx.userId, entityType: 'template', entityId: ref });
      return 'ok';
    },
    async remove(ctx, ref) {
      await unfavoriteEntity({ userId: ctx.userId, entityType: 'template', entityId: ref });
    },
  },
};
