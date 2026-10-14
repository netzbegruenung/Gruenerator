/**
 * Turns queued podcasts into audio: script first, then the two voices, then one
 * MP3 in the Mediathek.
 *
 * The `podcasts` table is the queue, claimed with `FOR UPDATE SKIP LOCKED`, so
 * every cluster process may run this. One podcast per tick and process: the
 * speech provider allows three generations per account at once (#3208), and a
 * podcast is dozens of them in a row.
 *
 * A failed step is retried from where it stopped — a written script is kept,
 * so a retry never pays for the LLM twice. The voices are paid per generated
 * second the moment synthesis returns, so nothing after it may lead to an
 * automatic second synthesis: encoding and storing get one in-process retry,
 * then the podcast fails (`AfterSynthesisError`). After `MAX_ATTEMPTS` the
 * podcast becomes `failed` with a sentence the page can show.
 */
import { type PodcastScript } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { runWithUsageContext } from '../../utils/usageContext.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import { TreeBudgetExceededError } from '../trees/index.js';
import { pcm16ToWav } from '../voice/pcmCodec.js';
import { encodeSpeech, type EncodedSpeech } from '../voice/speechEncoder.js';
import { synthesizeSegments, type SpeechSegment } from '../voice/speechService.js';

import { generatePodcastScript, type PodcastLocale } from './podcastScript.js';

import type { AudioShareResult, CreateAudioShareParams } from '../../types/media.js';

const log = createLogger('PodcastWorker');

export const MAX_ATTEMPTS = 3;
/** Generous: five minutes of audio are dozens of sequential provider calls. */
const STALE_CLAIM_MS = 15 * 60 * 1000;
const TICK_INTERVAL_MS = 5_000;
/** A pause between speakers reads as a conversation; inside a turn it stays at the chunk gap. */
const SPEAKER_GAP_MS = 450;

export const GENERIC_FAILURE =
  'Der Podcast konnte nicht erstellt werden. Bitte versuch es noch einmal.';
export const PROVIDER_BUSY_FAILURE =
  'Die Vertonung ist gerade ausgelastet. Bitte versuch es in ein paar Minuten noch einmal.';

export interface ClaimedPodcast {
  id: string;
  user_id: string;
  title: string;
  source_text: string;
  script: PodcastScript | null;
  voice_a: string;
  voice_b: string;
  locale: PodcastLocale;
  attempts: number;
}

export interface PodcastWorkerDeps {
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };
  writeScript: (
    sourceText: string,
    title: string,
    locale: PodcastLocale
  ) => Promise<{ title: string; turns: PodcastScript['turns'] }>;
  synthesize: (
    userId: string,
    segments: SpeechSegment[]
  ) => Promise<{ pcm: Buffer; sampleRate: number; durationSeconds: number }>;
  encode: (wav: Buffer) => Promise<EncodedSpeech>;
  createAudioShare: (userId: string, params: CreateAudioShareParams) => Promise<AudioShareResult>;
}

export const CLAIM_SQL = `UPDATE podcasts p
    SET claim_at = now(), attempts = p.attempts + 1
  WHERE p.id = (
    SELECT id FROM podcasts
     WHERE status IN ('queued', 'scripting', 'voicing')
       AND deleted_at IS NULL
       AND attempts < $1
       AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)
     ORDER BY created_at
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  RETURNING p.id, p.user_id, p.title, p.source_text, p.script, p.voice_a, p.voice_b,
            p.locale, p.attempts`;

/** Out of attempts after a crash (the claim went stale without an outcome). */
export const GIVE_UP_SQL = `UPDATE podcasts
    SET status = 'failed', error = $3, claim_at = NULL, updated_at = now()
  WHERE status IN ('queued', 'scripting', 'voicing')
    AND deleted_at IS NULL
    AND attempts >= $1
    AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)`;

const SET_STATUS_SQL = `UPDATE podcasts SET status = $2, updated_at = now() WHERE id = $1`;

const SAVE_SCRIPT_SQL = `UPDATE podcasts
    SET script = $2, title = $3, status = 'voicing', updated_at = now()
  WHERE id = $1`;

const FINISH_SQL = `UPDATE podcasts
    SET status = 'ready', media_id = $2, duration_seconds = $3, error = NULL,
        claim_at = NULL, updated_at = now()
  WHERE id = $1`;

const FAIL_SQL = `UPDATE podcasts
    SET status = 'failed', error = $2, claim_at = NULL, updated_at = now()
  WHERE id = $1`;

/** Frees the claim so the next tick retries instead of waiting for it to go stale. */
const RELEASE_SQL = `UPDATE podcasts SET claim_at = NULL, updated_at = now() WHERE id = $1`;

export function toSegments(row: ClaimedPodcast, script: PodcastScript): SpeechSegment[] {
  return script.turns.map((turn) => ({
    text: turn.text,
    voiceId: turn.speaker === 'a' ? row.voice_a : row.voice_b,
  }));
}

/** Encoding or storing failed after the voices were already paid for. */
export class AfterSynthesisError extends Error {
  constructor(cause: unknown) {
    super(`after synthesis: ${(cause as Error)?.message ?? String(cause)}`, { cause });
    this.name = 'AfterSynthesisError';
  }
}

async function onceMore<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch {
    return step();
  }
}

/** KugelAudio reports an empty prepaid balance and real overload alike as 429. */
function isProviderBusy(error: unknown): boolean {
  return error instanceof Error && /KugelAudio antwortete mit 429/.test(error.message);
}

export async function processClaimed(row: ClaimedPodcast, deps: PodcastWorkerDeps): Promise<void> {
  let script = row.script;
  let title = row.title;
  if (!script) {
    await deps.db.query(SET_STATUS_SQL, [row.id, 'scripting']);
    const draft = await deps.writeScript(row.source_text, row.title, row.locale);
    script = { turns: draft.turns };
    title = draft.title.trim() || row.title;
    await deps.db.query(SAVE_SCRIPT_SQL, [row.id, JSON.stringify(script), title]);
  } else {
    await deps.db.query(SET_STATUS_SQL, [row.id, 'voicing']);
  }

  const speech = await deps.synthesize(row.user_id, toSegments(row, script));
  let shareId: string;
  try {
    const encoded = await onceMore(() => deps.encode(pcm16ToWav(speech.pcm, speech.sampleRate)));
    const share = await onceMore(() =>
      deps.createAudioShare(row.user_id, {
        ...encoded,
        title,
        durationSeconds: speech.durationSeconds,
      })
    );
    shareId = share.id;
  } catch (error) {
    throw new AfterSynthesisError(error);
  }
  await deps.db.query(FINISH_SQL, [row.id, shareId, Math.round(speech.durationSeconds * 10) / 10]);
}

/** Decides what a failed attempt means for the row: final, or another try. */
export async function handleFailure(
  row: ClaimedPodcast,
  error: unknown,
  deps: PodcastWorkerDeps
): Promise<void> {
  // The budget will not grow back within the retry window; its message is
  // already written for people.
  if (error instanceof TreeBudgetExceededError) {
    await deps.db.query(FAIL_SQL, [row.id, error.message]);
    return;
  }
  reportBackgroundError(error, { job: 'podcast', podcastId: row.id, attempt: row.attempts });
  // Another attempt would synthesise — and bill — the same audio again.
  if (error instanceof AfterSynthesisError || row.attempts >= MAX_ATTEMPTS) {
    await deps.db.query(FAIL_SQL, [
      row.id,
      isProviderBusy(error) ? PROVIDER_BUSY_FAILURE : GENERIC_FAILURE,
    ]);
    return;
  }
  await deps.db.query(RELEASE_SQL, [row.id]);
}

export async function drainPodcasts(deps: PodcastWorkerDeps = defaultDeps()): Promise<boolean> {
  await deps.db.query(GIVE_UP_SQL, [MAX_ATTEMPTS, String(STALE_CLAIM_MS), GENERIC_FAILURE]);
  const rows = await deps.db.query<ClaimedPodcast>(CLAIM_SQL, [
    MAX_ATTEMPTS,
    String(STALE_CLAIM_MS),
  ]);
  const row = rows[0];
  if (!row) return false;
  try {
    await runWithUsageContext({ req: { user: { id: row.user_id } }, feature: 'voice' }, () =>
      processClaimed(row, deps)
    );
  } catch (error) {
    log.warn(`Podcast ${row.id} attempt ${row.attempts} failed: ${(error as Error).message}`);
    await handleFailure(row, error, deps);
  }
  return true;
}

export function defaultDeps(): PodcastWorkerDeps {
  const db = getPostgresInstance();
  return {
    db: { query: <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params) },
    writeScript: (sourceText, title, locale) => generatePodcastScript(sourceText, title, locale),
    synthesize: (userId, segments) =>
      synthesizeSegments(userId, segments, {
        speed: null,
        signal: null,
        segmentGapMs: SPEAKER_GAP_MS,
      }),
    encode: (wav) => encodeSpeech(wav, 'mp3'),
    createAudioShare: (userId, params) => getSharedMediaService().createAudioShare(userId, params),
  };
}

const worker = createIntervalWorker({
  name: 'Podcasts',
  intervalMs: TICK_INTERVAL_MS,
  initialDelayMs: 20_000,
  tick: async () => {
    await drainPodcasts();
  },
});

export function startPodcastWorker(): void {
  worker.start();
}

export function stopPodcastWorker(): void {
  worker.stop();
}
