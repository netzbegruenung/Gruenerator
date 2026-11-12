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

/**
 * List the caller's own documents (docs/sheets/presentations — excludes boards),
 * newest first. Same owned/shared/group access predicate as the docs list
 * endpoint (`docsAccessWhere`), so a chat tool reusing this can never surface
 * another user's content. Title-only projection, kept lean for the loop.
 */
export async function listUserDocuments(
  userId: string,
  limit: number,
  subtypes: string[] = DOCS_ONLY_SUBTYPES
): Promise<DocSearchHit[]> {
  return (await db.query(
    `SELECT cd.id, cd.title, cd.document_subtype, cd.updated_at
     FROM collaborative_documents cd
     WHERE ${docsAccessWhere('$2', '$1')}
     ORDER BY cd.updated_at DESC
     LIMIT $3`,
    [userId, subtypes, limit]
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
  // Jedes Wort muss vorkommen, nicht die ganze Eingabe als Phrase: das Modell
  // sucht mit Stichwortketten („Klärwerk Ost Abwärme"), und die trafen als
  // ein Muster praktisch nie.
  const patterns = officeSearchTerms(query).map(likeContainsPattern);
  if (patterns.length === 0) return [];
  const termWhere = patterns
    .map((_, i) => `(cd.title ILIKE $${i + 4} OR cd.content ILIKE $${i + 4})`)
    .join(' AND ');
  return (await db.query(
    `SELECT cd.id, cd.title, cd.document_subtype, cd.updated_at, cd.content
     FROM collaborative_documents cd
     WHERE ${docsAccessWhere('$2', '$1')}
       AND ${termWhere}
     ORDER BY cd.updated_at DESC
     LIMIT $3`,
    [userId, subtypes, limit, ...patterns]
  )) as OfficeContentHit[];
}

const MAX_OFFICE_SEARCH_TERMS = 6;

/** Die Wörter einer Suche, ohne Ein-Zeichen-Rauschen und Dubletten. */
export function officeSearchTerms(query: string): string[] {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length >= 2);
  return [...new Set(words.map((w) => w.toLowerCase()))].slice(0, MAX_OFFICE_SEARCH_TERMS);
}
