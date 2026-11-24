/**
 * Uploaded files (`documents`) and saved texts (`user_documents`) that someone
 * shared into a Projekt the reader belongs to.
 *
 * One rule for every reader: the share exists, the reader is an ACTIVE member
 * of that project, the project is not trashed, and the share does not withhold
 * read permission — the same rule `docsAccessWhere` applies to collaborative
 * documents. Whoever leaves a project loses its shared content again.
 *
 * Callers: the @datei picker list (`GET /api/documents/combined-content/shared`),
 * the chat's document-scope authorization (`documentScopeAccess.ts`) and the
 * saved-text loader (`documentContextService.ts`).
 */

export type ProjectSharedContentType = 'documents' | 'user_documents';

/**
 * Subquery yielding the `content_id`s (text) of `contentType` rows shared into
 * a project the user in `userParam` actively belongs to. Placeholder names, not
 * values, because callers number their parameters differently.
 */
export function projectSharedContentIdsSql(
  contentType: ProjectSharedContentType,
  userParam: string
): string {
  return `(
    SELECT gcs.content_id
      FROM group_content_shares gcs
      INNER JOIN group_memberships gm
        ON gm.group_id = gcs.group_id AND gm.user_id = ${userParam}::uuid AND gm.is_active = TRUE
      INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
     WHERE gcs.content_type = '${contentType}'
       AND (gcs.permissions->>'read')::boolean IS NOT FALSE
  )`;
}

/** Same rule as above, with the names of the projects that share each item. */
export function projectSharedContentGroupsSql(
  contentType: ProjectSharedContentType,
  userParam: string
): string {
  return `
    SELECT gcs.content_id, array_agg(DISTINCT g.name ORDER BY g.name) AS group_names
      FROM group_content_shares gcs
      INNER JOIN group_memberships gm
        ON gm.group_id = gcs.group_id AND gm.user_id = ${userParam}::uuid AND gm.is_active = TRUE
      INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
     WHERE gcs.content_type = '${contentType}'
       AND (gcs.permissions->>'read')::boolean IS NOT FALSE
     GROUP BY gcs.content_id`;
}

export interface ProjectSharedDocument {
  id: string;
  title: string;
  filename: string | null;
  source_type: string | null;
  created_at: string;
  shared_via_groups: string[];
}

export interface ProjectSharedText {
  id: string;
  title: string;
  document_type: string | null;
  created_at: string;
  shared_via_groups: string[];
}

interface Query {
  query: (sql: string, params: unknown[]) => Promise<unknown[]>;
}

/**
 * What others shared into the user's Projekte — the @datei picker's second
 * list. Own items are left out (they are already in `combined-content`), as
 * are files that are not done processing: the chat cannot search them yet.
 */
export async function listProjectSharedContent(
  userId: string,
  db: Query
): Promise<{ documents: ProjectSharedDocument[]; texts: ProjectSharedText[] }> {
  const [documents, texts] = await Promise.all([
    db.query(
      `SELECT d.id, d.title, d.filename, d.source_type, d.created_at, s.group_names AS shared_via_groups
         FROM (${projectSharedContentGroupsSql('documents', '$1')}) s
         JOIN documents d ON d.id::text = s.content_id
        WHERE d.deleted_at IS NULL AND d.status = 'completed'
          AND d.user_id IS NOT NULL AND d.user_id <> $1
        ORDER BY d.created_at DESC`,
      [userId]
    ) as Promise<ProjectSharedDocument[]>,
    db.query(
      `SELECT t.id, t.title, t.document_type, t.created_at, s.group_names AS shared_via_groups
         FROM (${projectSharedContentGroupsSql('user_documents', '$1')}) s
         JOIN user_documents t ON t.id::text = s.content_id
        WHERE t.deleted_at IS NULL AND t.is_active = true AND t.user_id <> $1
        ORDER BY t.created_at DESC`,
      [userId]
    ) as Promise<ProjectSharedText[]>,
  ]);
  return { documents, texts };
}
