import { NON_LIBRARY_UPLOAD_SOURCES } from '@gruenerator/shared/media-library/constants';

import { SOURCE_CONTENT_ORIGINS } from './sharedMediaOrigin.js';

/**
 * The filter policies over `shared_media`, in one place.
 *
 * Four query families read this table, and each needs a different answer to
 * "what should this person see here":
 *
 *  - **Creation feeds** — the workplace "Zuletzt" strip, the Studio galleries on
 *    web and mobile, `/api/content?kind=image`, the share galleries, the chat
 *    media list. They show what someone *made*, so internal artifacts stay out
 *    and drafts stay in: canvas autosave writes `'draft'` and only an explicit
 *    publish promotes to `'ready'`, so a ready-only filter would permanently
 *    hide autosaved work. Built by {@link creationFeedWhere}.
 *  - **The asset pool** — the Mediathek (`getMediaLibrary`). A curated shelf of
 *    things to build *with*, so uploads belong here and drafts do not. Built by
 *    {@link assetPoolWhere}.
 *  - **Orphan reaping** — `reapOrphanedShares`. The complement of the other
 *    three: {@link ORPHANED_SHARE_STATUSES}, the rows no listing shows and no
 *    UI deletes.
 *  - **Quota** — `getLibraryUsage`. The library-item half of the asset pool
 *    ({@link LIBRARY_ITEM_CLAUSE}) intersected with
 *    {@link USER_VISIBLE_SHARE_STATUSES}: you are charged for what you can see
 *    and delete, and for nothing else. A `'failed'` or stuck `'processing'`
 *    row therefore does *not* occupy a slot — it appears in no listing and no
 *    UI can remove it, so counting it would pin an account at the cap with no
 *    way back (#2980). Note this is the one family that keeps drafts *and*
 *    uploads, so it matches neither helper and builds its own WHERE.
 *
 * Why this module exists: the first two were raw SQL strings in three places
 * that had to be kept in step by hand, and they expressed the *same* intent
 * about internal artifacts through two different columns — `is_library_item`
 * here, `upload_source` there. Those agree only because `is_library_item` is
 * derived from `upload_source` at insert time (`uploadMediaFile`), and nothing
 * enforced that they keep agreeing: `createImageShare` omits `is_library_item`
 * entirely and rides the column default. `content_origin` then arrived as a
 * third axis and had to be written into two of those places by hand; here it is
 * one line, and the next axis will be one line too.
 */

/**
 * Statuses a user sees in their own creation listings. Surfaces that
 * intentionally narrow (the Mediathek is ready-only) go through
 * {@link assetPoolWhere} instead of passing a hand-written status here.
 */
export const USER_VISIBLE_SHARE_STATUSES = ['ready', 'draft'] as const;

/**
 * The other half of the status space: rows that will never become anything.
 *
 * `'processing'` is written by `createPendingVideoShare` and only
 * `finalizeVideoShare` clears it; `'failed'` is written by `markShareFailed`.
 * Both are invisible everywhere a user could act on them — the Mediathek is
 * ready-only, the galleries are {@link USER_VISIBLE_SHARE_STATUSES} — so no
 * button deletes them and, since #2980 removed the LRU eviction that used to
 * sweep them along with everything else, nothing did (#2989). They are reaped
 * by age instead; see `reapOrphanedShares`.
 *
 * Together with {@link USER_VISIBLE_SHARE_STATUSES} this must exhaust the
 * statuses the service writes (`ShareStatus` in `@gruenerator/shared/share`).
 * The reaper deletes rows *and their files*, so it names its statuses from
 * this allowlist rather than saying `NOT IN (ready, draft)`: a fifth status
 * added later should be invisible to it until someone decides otherwise, not
 * swept up by a predicate that was never told about it.
 */
export const ORPHANED_SHARE_STATUSES = ['processing', 'failed'] as const;

/**
 * Rows that are the user's own assets rather than internal machinery.
 *
 * `is_library_item = FALSE` marks canvas/chat thumbnails and template previews.
 * They are referenced by `canvas_documents.thumbnail_url`, so they must neither
 * show up as content nor count against the quota — their lifecycle is
 * delete-on-replace in `updateCanvas`. `COALESCE` because rows written before
 * the column existed carry NULL and are ordinary assets.
 *
 * ("nor be evictable" until #2980: the quota used to enforce itself by deleting
 * the oldest rows and their files on every write. Nothing evicts anything now.)
 */
export const LIBRARY_ITEM_CLAUSE = 'COALESCE(is_library_item, TRUE) = TRUE';

/**
 * WHERE fragment for a creation feed, `AND`-joined and ready to embed.
 *
 * Appends its bind values to `params` and numbers the placeholders off
 * `params.length`, so callers keep building their own query around it — the
 * same push-and-count idiom `withCursor`/`keysetWhere` already use.
 *
 * The two provenance filters answer different questions. `upload_source` keeps
 * internal artifacts out — thumbnails, canvas-element output. `content_origin`
 * keeps *source images* out: a background image someone dropped into the canvas
 * editor is not something they created. Both belong to every creation feed, so
 * neither is optional here.
 *
 * `status` is a parameter rather than a constant because the share galleries
 * legitimately ask for a single status (or, passing `null`, for none at all —
 * `/api/share/my-shares` reports every row it has). Everything else should pass
 * {@link USER_VISIBLE_SHARE_STATUSES}.
 */
export function creationFeedWhere(
  params: unknown[],
  status: string | readonly string[] | null
): string {
  const clauses: string[] = [];

  // Internal artifacts (gallery thumbnails, canvas-element tool output) are not
  // creations. `IS NULL` because the column post-dates the oldest rows.
  params.push([...NON_LIBRARY_UPLOAD_SOURCES]);
  clauses.push(`(upload_source IS NULL OR upload_source != ALL($${params.length}))`);

  // Source images are what someone built *with*, not what they made. Same
  // `IS NULL` tolerance, same reason.
  params.push([...SOURCE_CONTENT_ORIGINS]);
  clauses.push(`(content_origin IS NULL OR content_origin != ALL($${params.length}))`);

  // `typeof` rather than `Array.isArray`: the latter narrows a
  // `readonly string[]` to `any[]`, and the spread that follows then trips
  // `no-unsafe-assignment` under the type-aware lint config.
  if (typeof status === 'string') {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  } else if (status) {
    params.push([...status]);
    clauses.push(`status = ANY($${params.length})`);
  }

  return clauses.join(' AND ');
}

/**
 * WHERE fragment for the Mediathek, `AND`-joined and ready to embed.
 *
 * Takes no bind values, so the same string serves the page query and its COUNT
 * twin — which is the point: those two drifting apart is a paginator that
 * promises rows it will never hand out.
 *
 * Deliberately narrower on status than {@link USER_VISIBLE_SHARE_STATUSES} and
 * deliberately silent about both provenance columns: this is the one surface
 * where an upload belongs.
 */
export function assetPoolWhere(): string {
  return `status = 'ready' AND ${LIBRARY_ITEM_CLAUSE}`;
}
