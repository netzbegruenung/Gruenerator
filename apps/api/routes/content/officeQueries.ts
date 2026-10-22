import { type OfficeFilter, type OfficeQuery, type OfficeResponse } from '@gruenerator/contracts';

import { type CollaborativeDocument } from '../../database/schema/collaborative.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';
import { DOC_EXCERPT_CHARS, OFFICE_SUBTYPES, docsAccessWhere } from '../docs/constants.js';

const db = getPostgresInstance();
const TYPE_WHERE: Record<OfficeFilter, string> = {
  all: 'TRUE',
  doc: `cd.document_subtype NOT IN ('boards', 'sheets', 'tabelle', 'presentations')`,
  sheet: `cd.document_subtype IN ('sheets', 'tabelle')`,
  pres: `cd.document_subtype = 'presentations'`,
  board: `cd.document_subtype = 'boards'`,
};

/** Filter and count the whole accessible library before paging, as in the Mediathek. */
export async function listOffice(userId: string, query: OfficeQuery): Promise<OfficeResponse> {
  const limit = Math.min(Number(query.limit) || 50, 100);
  const offset = Math.min(Number(query.offset) || 0, Number.MAX_SAFE_INTEGER);
  const direction = query.sort === 'oldest' ? 'ASC' : 'DESC';
  const params: unknown[] = [userId, OFFICE_SUBTYPES];
  const search = query.search?.trim();
  let searchWhere = 'TRUE';
  if (search) {
    params.push(likeContainsPattern(search));
    searchWhere = `(cd.title ILIKE $3 OR cd.content ILIKE $3)`;
  }
  params.push(limit, offset);

  // The counted CTE carries no document bodies. Only this page gets excerpts.
  const rows = (await db.query(
    `WITH filtered AS (
       SELECT cd.id, cd.updated_at
       FROM collaborative_documents cd
       WHERE ${docsAccessWhere('$2', '$1')}
         AND ${TYPE_WHERE[query.typ ?? 'all']} AND ${searchWhere}
         -- Board metadata is stored as text; avoid a JSON cast on legacy prose rows.
         AND (cd.document_subtype <> 'boards' OR COALESCE(cd.content, '') !~ '"is_archived"\\s*:\\s*true')
     )
     SELECT (SELECT COUNT(*) FROM filtered) AS total,
            cd.id, cd.title, cd.updated_at, cd.document_subtype,
            CASE WHEN cd.document_subtype = 'boards' THEN cd.content
                 ELSE LEFT(cd.content, ${DOC_EXCERPT_CHARS}) END AS content,
            p.display_name AS creator_name,
            CASE WHEN cd.created_by = $1 THEN 'owner'
                 WHEN cd.permissions ? $1::text THEN 'direct' ELSE 'group' END AS access_type,
            COALESCE((SELECT json_agg(json_build_object('group_id', g.id, 'group_name', g.name))
              FROM group_content_shares gcs
              INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
                AND gm.user_id = $1 AND gm.is_active = TRUE
              INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
              WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = cd.id::text
                AND (gcs.permissions->>'read')::boolean IS NOT FALSE), '[]'::json) AS group_shares
     FROM (SELECT 1) AS one
     LEFT JOIN LATERAL (
       SELECT id, updated_at FROM filtered ORDER BY updated_at ${direction}, id ${direction}
       LIMIT $${params.length - 1} OFFSET $${params.length}
     ) AS page ON TRUE
     LEFT JOIN collaborative_documents cd ON cd.id = page.id
     LEFT JOIN profiles p ON p.id = cd.created_by
     ORDER BY page.updated_at ${direction}, page.id ${direction}`,
    params
  )) as Array<
    {
      [Key in 'id' | 'title' | 'updated_at' | 'document_subtype' | 'content']:
        CollaborativeDocument[Key] | null;
    } & {
      total: string;
      creator_name: string | null;
      access_type: OfficeResponse['items'][number]['access_type'];
      group_shares: OfficeResponse['items'][number]['group_shares'];
    }
  >;
  const total = Number(rows[0]?.total ?? 0);
  const items = rows.flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            title: row.title ?? 'Ohne Titel',
            updated_at:
              row.updated_at instanceof Date
                ? row.updated_at.toISOString()
                : (row.updated_at ?? ''),
            document_subtype: row.document_subtype ?? 'blank',
            content: row.content ?? '',
            creator_name: row.creator_name ?? '',
            access_type: row.access_type,
            group_shares: row.group_shares,
          },
        ]
      : []
  );
  return { items, total, limit, offset, hasMore: offset + items.length < total };
}
