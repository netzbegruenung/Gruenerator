/**
 * "Deine Werke" — what one account has created, for the profile "Nutzung" tab.
 *
 * Counted straight from the content tables rather than from a counter of our
 * own: those carry `created_at` since the account began, while
 * `user_usage_daily` only starts on 24.07.2026. The price is that the numbers
 * describe rows that still exist — a purged or hard-deleted row (empty chat
 * threads are deleted outright) stops counting.
 *
 * Every statement here reads trashed rows ON PURPOSE: the tab says "created",
 * not "currently there", and a count reveals no content. The file is
 * allowlisted in services/trash/trashReaders.vitest.ts for exactly that; keep
 * any reader that returns rows out of this file.
 */
import { collabSubtypeSchema, getUserActivityResponseSchema } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import type { GetUserActivityResponseDto } from '@gruenerator/contracts';

/**
 * The word count scans every assistant message the user ever received, which
 * for a heavy user is tens of megabytes of text. Ten minutes keeps reopening
 * the tab cheap; the UI says the numbers lag.
 */
const CACHE_TTL_SECONDS = 10 * 60;

/** Boards and canvas share `collaborative_documents` but are not "documents". */
const NON_DOCUMENT_SUBTYPES = "('canvas', 'boards')";

interface TotalsRow {
  member_since: Date | null;
  chats: number;
  user_messages: number;
  assistant_words: number;
  documents: number;
  designs: number;
  ai_images: number;
  subtitled_videos: number;
  deep_research: number;
}

// chat_messages has no index on user_id (its user_id on assistant rows is the
// thread owner anyway), so messages are reached through the owner's threads.
const TOTALS_SQL = `
  SELECT
    (SELECT created_at FROM profiles WHERE id = $1) AS member_since,
    (SELECT count(*)::int FROM chat_threads WHERE user_id = $1) AS chats,
    (SELECT count(*)::int
       FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE t.user_id = $1 AND m.role = 'user') AS user_messages,
    (SELECT coalesce(sum(array_length(regexp_split_to_array(btrim(m.content), '\\s+'), 1)), 0)::float8
       FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE t.user_id = $1 AND m.role = 'assistant' AND btrim(m.content) <> '') AS assistant_words,
    (SELECT count(*)::int FROM collaborative_documents
      WHERE created_by = $1
        AND coalesce(document_subtype, 'docs') NOT IN ${NON_DOCUMENT_SUBTYPES}) AS documents,
    (SELECT count(*)::int FROM collaborative_documents
      WHERE created_by = $1 AND document_subtype = 'canvas') AS designs,
    (SELECT count(*)::int FROM shared_media
      WHERE user_id = $1 AND content_origin = 'ki') AS ai_images,
    (SELECT count(*)::int FROM subtitler_projects WHERE user_id = $1) AS subtitled_videos,
    (SELECT count(*)::int FROM deep_research_runs WHERE user_id = $1::text) AS deep_research
`;

const DOCUMENTS_BY_TYPE_SQL = `
  SELECT coalesce(document_subtype, 'docs') AS subtype, count(*)::int AS count
    FROM collaborative_documents
   WHERE created_by = $1
     AND coalesce(document_subtype, 'docs') NOT IN ${NON_DOCUMENT_SUBTYPES}
   GROUP BY 1
   ORDER BY 2 DESC
`;

// Europe/Berlin is also Vienna's zone, so the day boundary is right for both
// audiences.
const HEATMAP_SQL = `
  WITH events AS (
    SELECT m.created_at
      FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
     WHERE t.user_id = $1 AND m.role = 'user' AND m.created_at >= now() - interval '365 days'
    UNION ALL
    SELECT created_at FROM collaborative_documents
     WHERE created_by = $1 AND created_at >= now() - interval '365 days'
    UNION ALL
    SELECT created_at FROM shared_media
     WHERE user_id = $1 AND content_origin = 'ki' AND created_at >= now() - interval '365 days'
  )
  SELECT to_char((created_at AT TIME ZONE 'Europe/Berlin')::date, 'YYYY-MM-DD') AS day,
         count(*)::int AS count
    FROM events
   GROUP BY 1
   ORDER BY 1
`;

export async function computeUserActivity(userId: string): Promise<GetUserActivityResponseDto> {
  const db = getPostgresInstance();
  const [totals, byType, heatmap] = await Promise.all([
    db.queryOne<TotalsRow>(TOTALS_SQL, [userId]),
    db.query<{ subtype: string; count: number }>(DOCUMENTS_BY_TYPE_SQL, [userId]),
    db.query<{ day: string; count: number }>(HEATMAP_SQL, [userId]),
  ]);

  return {
    success: true,
    member_since: totals?.member_since ? totals.member_since.toISOString() : null,
    works: {
      chats: totals?.chats ?? 0,
      user_messages: totals?.user_messages ?? 0,
      assistant_words: totals?.assistant_words ?? 0,
      documents: totals?.documents ?? 0,
      designs: totals?.designs ?? 0,
      ai_images: totals?.ai_images ?? 0,
      subtitled_videos: totals?.subtitled_videos ?? 0,
      deep_research: totals?.deep_research ?? 0,
    },
    // A subtype the enum predates is dropped from the breakdown rather than
    // failing the response; it still counts in `works.documents`.
    documents_by_type: byType.flatMap((row) => {
      const parsed = collabSubtypeSchema.safeParse(row.subtype);
      return parsed.success ? [{ subtype: parsed.data, count: row.count }] : [];
    }),
    heatmap,
  };
}

export async function getUserActivity(userId: string): Promise<GetUserActivityResponseDto> {
  const key = `usage:activity:${userId}`;
  const cached = await getCachedJson(key, getUserActivityResponseSchema);
  if (cached) return cached;

  const activity = await computeUserActivity(userId);
  await setCachedJson(key, activity, CACHE_TTL_SECONDS);
  return activity;
}
