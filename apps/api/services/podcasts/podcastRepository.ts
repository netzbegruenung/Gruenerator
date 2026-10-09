import {
  DEFAULT_TTS_VOICE_ID,
  ttsVoiceIdSchema,
  type PodcastDto,
  type PodcastScript,
  type PodcastStatus,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { TTS_VOICES } from '@gruenerator/shared/settings';
import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  deleteTrashedRow,
  isRowId,
  trashOwnedRow,
  type OwnedTrashResult,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

import { type PodcastLocale } from './podcastScript.js';

interface PodcastDtoRow {
  id: string;
  slug_suffix: string;
  title: string;
  status: PodcastStatus;
  error: string | null;
  script: PodcastScript | null;
  duration_seconds: number | null;
  media_id: string | null;
  share_token: string | null;
  voice_a: string;
  voice_b: string;
  created_at: Date;
}

/**
 * The host is the person's own voice from the settings; the expert is the first
 * voice that reads the other way, so the two are easy to tell apart.
 */
export function podcastVoices(preferred: string | null | undefined): {
  a: TtsVoiceId;
  b: TtsVoiceId;
} {
  const parsed = ttsVoiceIdSchema.safeParse(preferred);
  const a = parsed.success ? parsed.data : DEFAULT_TTS_VOICE_ID;
  const reading = TTS_VOICES.find((v) => v.id === a)?.reading ?? 'male';
  const b = TTS_VOICES.find((v) => v.reading !== reading)?.id ?? DEFAULT_TTS_VOICE_ID;
  return { a, b };
}

interface InsertPodcastInput {
  userId: string;
  title: string;
  sourceText: string;
  voices: { a: TtsVoiceId; b: TtsVoiceId };
  locale: PodcastLocale;
}

/** Inserts with a fresh slug suffix; a collision with a live row draws a new one. */
export async function insertPodcast(
  input: InsertPodcastInput
): Promise<{ id: string; slugSuffix: string }> {
  for (let attempt = 1; ; attempt++) {
    const slugSuffix = generateSlugSuffix();
    try {
      const rows = await getPostgresInstance().query<{ id: string }>(
        `INSERT INTO podcasts (user_id, slug_suffix, title, source_text, voice_a, voice_b, locale)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.userId,
          slugSuffix,
          input.title,
          input.sourceText,
          input.voices.a,
          input.voices.b,
          input.locale,
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Podcast row was not created');
      return { id, slugSuffix };
    } catch (error) {
      if (attempt >= 3 || !String((error as Error).message).includes('slug_suffix')) throw error;
    }
  }
}

/**
 * Owner-only read by slug suffix or raw uuid. The share token comes from the
 * live Mediathek row, so a trashed audio reads as gone.
 */
export async function getOwnPodcast(ref: string, userId: string): Promise<PodcastDto | null> {
  const column = isRowId(ref) ? 'p.id' : 'p.slug_suffix';
  const rows = await getPostgresInstance().query<PodcastDtoRow>(
    `SELECT p.id, p.slug_suffix, p.title, p.status, p.error, p.script, p.duration_seconds,
            sm.id AS media_id, sm.share_token, p.voice_a, p.voice_b, p.created_at
       FROM podcasts p
       LEFT JOIN shared_media sm ON sm.id = p.media_id AND sm.deleted_at IS NULL
      WHERE ${column} = $1 AND p.user_id = $2 AND p.deleted_at IS NULL`,
    [ref, userId]
  );
  const row = rows[0];
  return row ? toPodcastDto(row) : null;
}

export function toPodcastDto(row: PodcastDtoRow): PodcastDto {
  const voice = (raw: string) => {
    const parsed = ttsVoiceIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_TTS_VOICE_ID;
  };
  return {
    id: row.id,
    slugSuffix: row.slug_suffix,
    title: row.title,
    status: row.status,
    error: row.error,
    script: row.script,
    durationSeconds: row.duration_seconds,
    mediaId: row.media_id,
    shareToken: row.share_token,
    voices: { a: voice(row.voice_a), b: voice(row.voice_b) },
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Puts a failed podcast back in the queue; a written script is kept and not paid for twice. */
export async function requeueFailedPodcast(id: string, userId: string): Promise<boolean> {
  if (!isRowId(id)) return false;
  const rows = await getPostgresInstance().query<{ id: string }>(
    `UPDATE podcasts
        SET status = CASE WHEN script IS NULL THEN 'queued' ELSE 'voicing' END,
            attempts = 0, error = NULL, claim_at = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'failed' AND deleted_at IS NULL
      RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

/**
 * Papierkorb. The Mediathek audio is its own item and stays where it is —
 * deleting the podcast removes the script and the source text.
 */
export const PODCAST_TRASH: OwnedTrashTable = {
  table: 'podcasts',
  columns: 'id, title',
};

export function trashPodcast(userId: string, id: string): Promise<OwnedTrashResult> {
  return trashOwnedRow(PODCAST_TRASH, userId, id);
}

export async function purgePodcast(id: string, cutoff: Date | null): Promise<boolean> {
  return (await deleteTrashedRow(PODCAST_TRASH, id, cutoff)) !== null;
}
