/**
 * Notebooks: what people list publicly („Öffentlich" — formerly the section of
 * the same name on `/notebooks`). Which notebooks those are is decided in one
 * place, `listPublicNotebooksForViewer`; this adapter only shapes them into
 * items. System and Landesverband notebooks live in their own registry and are
 * not marketplace items. „Merken" is a bookmark (`entity_favorites`).
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { inArray } from 'drizzle-orm';

import { profiles } from '../../../database/schema/core.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { favoriteEntity, unfavoriteEntity } from '../../entityFavorites/EntityFavoritesService.js';
import { listPublicNotebooksForViewer } from '../../notebook/publicNotebookListing.js';
import { type MarketplaceContext } from '../context.js';
import { favoritedAmong } from '../enrich.js';

import { findCandidate, pageCandidates, type Candidate } from './inMemory.js';

import type { MarketplaceSource } from './types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';

type NotebookItem = MarketplaceItemOf<'notebook'>;

/**
 * Display names only. The old `/notebook-collections/public` list falls back to
 * the local part of the email address — that is not a name to show strangers.
 */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDrizzleInstance()
    .select({ id: profiles.id, name: profiles.display_name })
    .from(profiles)
    .where(inArray(profiles.id, userIds));
  return new Map(rows.flatMap((r) => (r.name?.trim() ? [[r.id, r.name.trim()] as const] : [])));
}

function toItem(
  ctx: MarketplaceContext,
  notebook: NotebookCollection,
  authorName: string | null
): NotebookItem {
  return {
    kind: 'notebook',
    key: `notebook:${notebook.id}`,
    ref: notebook.id,
    origin: 'oeffentlich',
    title: notebook.name,
    description: notebook.description || null,
    thumbnailUrl: null,
    iconKey: null,
    authorName,
    audience: notebook.audience,
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: notebook.user_id === ctx.userId,
    reportKind: 'notebook',
    createdAt: notebook.created_at ?? null,
    notebook: {
      slug: notebook.slug_suffix
        ? buildNotebookSlug(notebook.name, notebook.slug_suffix)
        : notebook.id,
    },
  };
}

async function candidates(ctx: MarketplaceContext): Promise<Candidate<'notebook'>[]> {
  const notebooks = await listPublicNotebooksForViewer(ctx.audience);
  const names = await displayNames([...new Set(notebooks.map((n) => n.user_id))]);
  return notebooks.map((notebook) => ({
    item: toItem(ctx, notebook, names.get(notebook.user_id) ?? null),
    rank: null,
    searchText: [],
  }));
}

export const notebookSource: MarketplaceSource<'notebook'> = {
  kind: 'notebook',
  likeType: 'notebook',
  reportKind: 'notebook',
  async list(ctx, query) {
    return pageCandidates(ctx, notebookSource, query, await candidates(ctx));
  },
  async isVisible(ctx, ref) {
    return (await listPublicNotebooksForViewer(ctx.audience)).some((n) => n.id === ref);
  },
  async get(ctx, ref) {
    return findCandidate(ctx, notebookSource, await candidates(ctx), ref);
  },
  save: {
    has: (ctx, refs) => favoritedAmong(ctx.userId, 'notebook', refs),
    async add(ctx, ref) {
      await favoriteEntity({ userId: ctx.userId, entityType: 'notebook', entityId: ref });
      return 'ok';
    },
    async remove(ctx, ref) {
      await unfavoriteEntity({ userId: ctx.userId, entityType: 'notebook', entityId: ref });
    },
  },
};
