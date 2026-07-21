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
