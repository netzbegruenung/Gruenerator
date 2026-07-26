/**
 * Content search over the user's own reels (subtitler projects), matching the
 * spoken word via the stored subtitle transcript as well as the title.
 *
 * Why plain ILIKE and no index: `subtitler_projects` is hard-capped at
 * MAX_PROJECTS_PER_USER (20) rows per user with oldest-eviction, and the scan is
 * already narrowed by `idx_subtitler_projects_user_id`. A tsvector/GIN or Qdrant
 * layer would cost a migration and a backfill to search at most 20 short rows.
 *
 * The `subtitles` column is TEXT holding two formats in the wild (a
 * JSON-stringified segment array, and the legacy "MM:SS.F - MM:SS.F\nText"
 * blocks) — see parseStoredSubtitles. The SQL match deliberately runs against
 * the raw blob, which works for both encodings because the spoken text is a
 * literal substring either way; the parse happens only for the few matched rows,
 * to build a timestamped snippet.
 */
import { formatTimeWithFraction, parseStoredSubtitles } from '@gruenerator/shared/subtitle-editor';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';

const log = createLogger('ReelSearch');
const db = getPostgresInstance();

/** `id` is a uuid column — a non-UUID ref from the model would raise a type error, not miss. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matched segments quoted per reel — enough to judge relevance, not a transcript dump. */
const MAX_SNIPPET_SEGMENTS = 3;
/** Full-transcript cap, mirroring reelEditService's MAX_PROMPT_SEGMENTS. */
const MAX_TRANSCRIPT_SEGMENTS = 150;

interface ReelSearchRow {
  id: string;
  title: string | null;
  status: string | null;
  thumbnail_path: string | null;
  subtitled_video_path: string | null;
  subtitles: string | null;
  last_edited_at: Date | string | null;
}

export interface ReelHit {
  id: string;
  title: string;
  /** Timestamped lines around the query match, or the opening lines as a fallback. */
  snippet: string;
  /** True when the query matched the transcript rather than only the title. */
  matchedTranscript: boolean;
  url: string;
  status: string | null;
  hasThumbnail: boolean;
  lastEditedAt: string | null;
}

export function reelUrl(projectId: string): string {
  return `/studio/video?project=${projectId}`;
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatSegmentLine(startTime: number, endTime: number, text: string): string {
  return `[${formatTimeWithFraction(startTime)}–${formatTimeWithFraction(endTime)}] ${text}`;
}

/**
 * Timestamped snippet for one hit. Prefers the segments whose text contains the
 * query, so the model sees *why* the reel matched and can cite a timecode; falls
 * back to the opening segments for a title-only match.
 */
function buildSnippet(
  subtitles: string | null,
  query: string
): { snippet: string; matchedTranscript: boolean } {
  const { segments } = parseStoredSubtitles(subtitles);
  if (segments.length === 0) return { snippet: '', matchedTranscript: false };

  const needle = query.trim().toLowerCase();
  const matched = needle ? segments.filter((s) => s.text.toLowerCase().includes(needle)) : [];
  const chosen = matched.length > 0 ? matched : segments;

  return {
    snippet: chosen
      .slice(0, MAX_SNIPPET_SEGMENTS)
      .map((s) => formatSegmentLine(s.startTime, s.endTime, s.text))
      .join('\n'),
    matchedTranscript: matched.length > 0,
  };
}

/**
 * Search the caller's own reels by title OR spoken subtitle content. Scoped to
 * `user_id` — reels have no group sharing, so ownership is the whole access rule.
 */
export async function searchReels(userId: string, query: string, limit = 5): Promise<ReelHit[]> {
  if (!query.trim()) return [];
  try {
    const rows = (await db.query(
      `SELECT id, title, status, thumbnail_path, subtitled_video_path, subtitles, last_edited_at
       FROM subtitler_projects
       WHERE user_id = $1
         AND (title ILIKE $2 OR subtitles ILIKE $2)
       ORDER BY last_edited_at DESC NULLS LAST
       LIMIT $3`,
      [userId, likeContainsPattern(query), limit]
    )) as ReelSearchRow[];

    return rows.map((r) => {
      const { snippet, matchedTranscript } = buildSnippet(r.subtitles, query);
      return {
        id: r.id,
        title: r.title || 'Unbenanntes Reel',
        snippet,
        matchedTranscript,
        url: reelUrl(r.id),
        status: r.status,
        hasThumbnail: Boolean(r.thumbnail_path),
        lastEditedAt: toIsoOrNull(r.last_edited_at),
      };
    });
  } catch (err) {
    log.warn(`Reel content search failed: ${err}`);
    return [];
  }
}

/**
 * Full timestamped transcript of one reel, for follow-ups that need the spoken
 * content itself ("schreib mir eine Caption dazu"). Ownership-scoped; returns
 * null when the reel is not the caller's or carries no subtitles.
 */
export async function getReelTranscript(
  userId: string,
  projectId: string
): Promise<{ title: string; transcript: string; segmentCount: number } | null> {
  if (!UUID_RE.test(projectId)) return null;
  try {
    const rows = (await db.query(
      `SELECT id, title, status, thumbnail_path, subtitled_video_path, subtitles, last_edited_at
       FROM subtitler_projects
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, projectId]
    )) as ReelSearchRow[];

    const row = rows[0];
    if (!row) return null;

    const { segments } = parseStoredSubtitles(row.subtitles);
    if (segments.length === 0) return null;

    return {
      title: row.title || 'Unbenanntes Reel',
      transcript: segments
        .slice(0, MAX_TRANSCRIPT_SEGMENTS)
        .map((s) => formatSegmentLine(s.startTime, s.endTime, s.text))
        .join('\n'),
      segmentCount: segments.length,
    };
  } catch (err) {
    log.warn(`Reel transcript lookup failed for ${projectId}: ${err}`);
    return null;
  }
}
