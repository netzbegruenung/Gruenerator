/**
 * Notebooks: the system notebooks from the registry (`NOTEBOOK_REGISTRY` —
 * „Offiziell", the Landesverband notebooks as „Landesverband") plus what people
 * list publicly („Öffentlich"). Since the `/wissen` gallery is gone, this is
 * where system notebooks are found. Which public notebooks there are is
 * decided in one place, `listPublicNotebooksForViewer`; which system notebooks,
 * by the registry's instance gates. „Merken" is a bookmark (`entity_favorites`).
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';
import {
  isNotebookOfferedIn,
  isNotebookResolvableIn,
  NOTEBOOK_REGISTRY,
  type NotebookDefinition,
} from '@gruenerator/shared/notebooks';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { inArray } from 'drizzle-orm';

import { profiles } from '../../../database/schema/core.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { favoriteEntity, unfavoriteEntity } from '../../entityFavorites/EntityFavoritesService.js';
import { listPublicNotebooksForViewer } from '../../notebook/publicNotebookListing.js';
import { type MarketplaceContext } from '../context.js';
import { favoritedAmong } from '../enrich.js';

import { findCandidate, pageCandidates, type Candidate } from './inMemory.js';

import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { MarketplaceSource } from './types.js';

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

/**
 * The multi-source „Grünerator" notebook only had a page on `/wissen`, which is
 * gone; it lives on as the chat's `@alle` mention, not as a notebook to open.
 */
const AGGREGATE_NOTEBOOK_ID = 'gruenerator-notebook';

/**
 * A system notebook as an item. `ref` and `slug` are the registry id — the web
 * resolver forwards `/notebooks/<registry id>` to the notebook's page.
 * Official content: no report, no author.
 */
function systemItem(nb: NotebookDefinition): NotebookItem {
  return {
    kind: 'notebook',
    key: `notebook:${nb.id}`,
    ref: nb.id,
    origin: nb.category === 'landesebene' ? 'landesverband' : 'offiziell',
    title: nb.title,
    description: nb.description || null,
    thumbnailUrl: null,
    iconKey: null,
    authorName: null,
    audience: nb.audience,
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: false,
    reportKind: null,
    createdAt: null,
    notebook: { slug: nb.id },
  };
}

/**
 * Lists show what the instance offers; a link, a like or a save may also
 * resolve a notebook the instance merely hides (`isNotebookResolvableIn`).
 */
function systemCandidates(ctx: MarketplaceContext, forList: boolean): Candidate<'notebook'>[] {
  const gate = forList ? isNotebookOfferedIn : isNotebookResolvableIn;
  return NOTEBOOK_REGISTRY.filter(
    (nb) => nb.id !== AGGREGATE_NOTEBOOK_ID && gate(nb.id, ctx.instanceId)
  ).map((nb) => ({
    item: systemItem(nb),
    rank: nb.order,
    searchText: [nb.mention.alias, ...nb.tags],
  }));
}

async function candidates(
  ctx: MarketplaceContext,
  forList: boolean
): Promise<Candidate<'notebook'>[]> {
  const notebooks = await listPublicNotebooksForViewer(ctx.audience);
  const names = await displayNames([...new Set(notebooks.map((n) => n.user_id))]);
  return [
    ...systemCandidates(ctx, forList),
    ...notebooks.map((notebook) => ({
      item: toItem(ctx, notebook, names.get(notebook.user_id) ?? null),
      rank: null,
      searchText: [],
    })),
  ];
}

export const notebookSource: MarketplaceSource<'notebook'> = {
  kind: 'notebook',
  likeType: 'notebook',
  reportKind: 'notebook',
  async list(ctx, query) {
    return pageCandidates(ctx, notebookSource, query, await candidates(ctx, true));
  },
  async isVisible(ctx, ref) {
    if (systemCandidates(ctx, false).some((c) => c.item.ref === ref)) return true;
    return (await listPublicNotebooksForViewer(ctx.audience)).some((n) => n.id === ref);
  },
  async get(ctx, ref) {
    return findCandidate(ctx, notebookSource, await candidates(ctx, false), ref);
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
