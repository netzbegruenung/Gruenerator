/**
 * Title search over the user's collaborative documents, for `/api/global-search`.
 */

import { type InferSelectModel } from 'drizzle-orm';

import { type collaborative_documents } from '../../database/schema/collaborative.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';

import { DOCS_ONLY_SUBTYPES, docsAccessWhere } from './constants.js';

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
