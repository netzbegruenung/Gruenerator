/**
 * Title search over the user's collaborative documents, for `/api/global-search`.
 */

import { type InferSelectModel } from 'drizzle-orm';

import { type collaborative_documents } from '../../database/schema/collaborative.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';

import { DOCS_ONLY_SUBTYPES, OFFICE_SUBTYPES, docsAccessWhere } from './constants.js';

export {
  officeKind,
  officeKindLabel,
  officeSnippet,
  officeUrl,
  type OfficeKind,
} from './officeContentFormat.js';

const db = getPostgresInstance();

type CollabRow = InferSelectModel<typeof collaborative_documents>;

export type DocSearchHit = Pick<CollabRow, 'id' | 'title' | 'document_subtype' | 'updated_at'>;

export async function searchDocuments(
  userId: string,
  query: string,
  limit: number
): Promise<DocSearchHit[]> {
  return (await db.query(
    `SELECT cd.id, cd.title, cd.document_subtype, cd.updated_at
     FROM collaborative_documents cd
     WHERE ${docsAccessWhere('$2', '$1')}
       AND cd.title ILIKE $3
     ORDER BY cd.updated_at DESC
     LIMIT $4`,
    [userId, DOCS_ONLY_SUBTYPES, likeContainsPattern(query), limit]
  )) as DocSearchHit[];
}

export interface OfficeContentSearchOptions {
  /** Subtypes to search. Defaults to all office content (docs/boards/sheets/presentations). */
  subtypes?: string[];
  limit?: number;
}

/** A DocSearchHit plus the denormalized content preview (for rerank + size probe). */
export type OfficeContentHit = DocSearchHit & { content: string | null };

/**
 * Search the user's own office content — docs, boards, sheets, presentations —
 * by title OR the denormalized `content` preview. Broader than `searchDocuments`
 * (which is title-only and excludes boards); used by chat recall. The `content`
 * match is a best-effort bonus: it is an up-to-2000-char preview and stale for
 * some subtypes, so title stays the reliable signal. Same owned/shared/group
 * access predicate as the docs list, so a user never sees another's content.
 */
export async function searchOfficeContent(
  userId: string,
  query: string,
  options: OfficeContentSearchOptions = {}
): Promise<OfficeContentHit[]> {
  const { subtypes = OFFICE_SUBTYPES, limit = 5 } = options;
  const pattern = likeContainsPattern(query);
  return (await db.query(
    `SELECT cd.id, cd.title, cd.document_subtype, cd.updated_at, cd.content
     FROM collaborative_documents cd
     WHERE ${docsAccessWhere('$2', '$1')}
       AND (cd.title ILIKE $3 OR cd.content ILIKE $3)
     ORDER BY cd.updated_at DESC
     LIMIT $4`,
    [userId, subtypes, pattern, limit]
  )) as OfficeContentHit[];
}
