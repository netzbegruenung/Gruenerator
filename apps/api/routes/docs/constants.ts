import { COLLAB_SUBTYPE_VALUES } from '@gruenerator/contracts';

/**
 * All valid subtypes for collaborative_documents.
 * Used by docs, boards, canvas, and any future collaborative content types.
 * Single-sourced from the contracts package so backend and Zod contract can't
 * drift (the tuple there also drives `collabSubtypeSchema`).
 */
export const COLLAB_SUBTYPES: string[] = [...COLLAB_SUBTYPE_VALUES];

/** @deprecated Use COLLAB_SUBTYPES instead */
export const DOCS_SUBTYPES = COLLAB_SUBTYPES;

/**
 * Document-only subtypes (excludes boards and canvas, which have their own
 * listing endpoints). Sheets stay in on purpose: they share the /docs list.
 */
export const DOCS_ONLY_SUBTYPES = COLLAB_SUBTYPES.filter((s) => s !== 'boards' && s !== 'canvas');

/**
 * The user's own "office" content for recall — docs, boards, sheets,
 * presentations (everything except `canvas`, which is the sharepic surface with
 * its own gallery). Broader than DOCS_ONLY_SUBTYPES because recall wants boards.
 */
export const OFFICE_SUBTYPES = COLLAB_SUBTYPES.filter((s) => s !== 'canvas');

/** Marker for permissions auto-granted when a user visits an 'authenticated' share link */
export const GRANTED_BY_SHARE_LINK = 'auto:share_link';

/**
 * How much of a document's HTML `?preview=true` returns as `content_excerpt`.
 *
 * Generous on purpose. The consumer strips tags and keeps ~260 characters of
 * plain text, so the budget has to survive whatever markup the editor wraps that
 * text in — a heading plus a couple of styled paragraphs is easily 10× its own
 * length in tags. Too tight and previews come back empty for exactly the
 * documents that have the richest formatting.
 */
export const DOC_EXCERPT_CHARS = 4000;

/**
 * Every column of `collaborative_documents` except `content`.
 *
 * Spelled out because Postgres has no "SELECT * EXCEPT" and the alternatives
 * (jsonb subtraction) would change the row shape for the joined columns the list
 * query adds alongside. Keep in step with the table — a column added to
 * `schema.sql` and forgotten here silently disappears from preview responses.
 */
const DOC_COLUMNS_WITHOUT_CONTENT = [
  'id',
  'title',
  'created_by',
  'created_at',
  'updated_at',
  'last_edited_by',
  'last_edited_at',
  'is_public',
  'permissions',
  'folder_id',
  'is_deleted',
  'document_subtype',
  'share_permission',
  'share_mode',
] as const;

/**
 * The `collaborative_documents` columns the list query selects, aliased `cd`.
 *
 * `preview` trades the full `content` for a truncated `content_excerpt`. The
 * mobile Arbeiten tab asks for it: it draws a two-line excerpt on each card and
 * was downloading every document in full — unbounded, over mobile data — to do
 * it. Off by default so existing callers keep the payload they rely on.
 */
export function docListColumns(preview: boolean): string {
  if (!preview) return 'cd.*';
  const columns = DOC_COLUMNS_WITHOUT_CONTENT.map((c) => `cd.${c}`).join(', ');
  return `${columns}, LEFT(cd.content, ${DOC_EXCERPT_CHARS}) AS content_excerpt`;
}

/**
 * Canonical read-visibility predicate for `collaborative_documents` (aliased
 * `cd`): owned, directly shared, or group-shared. Shared by the docs list and
 * the global-search docs query so the two can't drift on who sees which
 * document. Takes placeholder names rather than fixed `$n` slots because the
 * two callers number their parameters differently.
 */
export function docsAccessWhere(subtypesParam: string, userParam: string): string {
  return `
    cd.document_subtype = ANY(${subtypesParam}::text[])
    AND cd.is_deleted = false
    AND (
      cd.created_by = ${userParam}
      OR cd.permissions ? ${userParam}::text
      OR cd.id IN (
        SELECT gcs.content_id::uuid
        FROM group_content_shares gcs
        INNER JOIN group_memberships gm
          ON gm.group_id = gcs.group_id AND gm.user_id = ${userParam} AND gm.is_active = TRUE
        WHERE gcs.content_type = 'collaborative_documents'
          AND (gcs.permissions->>'read')::boolean IS NOT FALSE
      )
    )
  `;
}
