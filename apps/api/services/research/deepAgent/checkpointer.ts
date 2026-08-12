/**
 * Makes a run survive the process it started in.
 *
 * `resume.ts` already rescues a run whose STREAM died: it re-invokes the agent
 * with the last state the caller happened to be holding. What it cannot rescue
 * is the process — a deploy, a restart, an OOM mid-run forfeits a quarter hour
 * of searches, crawls and subagent reports, because that state lived only in a
 * local variable. The framework has an answer for this and we were not using it:
 * a checkpointer writes every step, keyed by `thread_id`.
 *
 * ## Why Postgres and not `MemorySaver`
 *
 * `MemorySaver` is the same local variable with more ceremony — it dies with the
 * process, which is the one failure this exists for. We already run Postgres,
 * and `PostgresSaver` brings its own schema.
 *
 * ## Fail open, always
 *
 * Every path here returns `null` rather than throwing: no pool, `setup()`
 * failing, the package unavailable. A run without a checkpointer is exactly the
 * run we had before this change — worse than one with, far better than none.
 * Research must not become undeliverable because a table could not be created.
 *
 * ## `setup()` runs once per process
 *
 * It creates the tables and runs the saver's own migrations, and it is
 * documented as something the caller MUST do before first use. Doing it per run
 * would put DDL in front of every research; the promise is cached so concurrent
 * runs share one attempt, and a failed attempt is not retried in a loop.
 */

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

import { getPostgresInstance } from '../../../database/services/PostgresService/index.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeepAgentCheckpointer');

/**
 * Its own schema, not `public`.
 *
 * The saver creates four tables (`checkpoints`, `checkpoint_blobs`,
 * `checkpoint_writes`, `checkpoint_migrations`) under names generic enough to
 * collide with something we add later, and they are the saver's to migrate —
 * `PostgresService.init()` must never find them among ours.
 */
export const CHECKPOINT_SCHEMA = 'langgraph';

let cached: Promise<PostgresSaver | null> | null = null;

async function build(): Promise<PostgresSaver | null> {
  const pool = getPostgresInstance().pool;
  if (!pool) {
    log.warn('[Checkpointer] Kein Postgres-Pool — Lauf ohne Wiederaufnahme über Neustarts');
    return null;
  }
  try {
    // The app's own pool rather than a second connection: a research run is a
    // handful of writes per minute and does not deserve its own pool, and one
    // pool is one place where limits and TLS are configured.
    const saver = new PostgresSaver(pool, undefined, { schema: CHECKPOINT_SCHEMA });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${CHECKPOINT_SCHEMA}`);
    await saver.setup();
    log.info(`[Checkpointer] bereit (Schema ${CHECKPOINT_SCHEMA})`);
    return saver;
  } catch (error) {
    log.warn(`[Checkpointer] Aufbau fehlgeschlagen, Lauf bleibt flüchtig: ${String(error)}`);
    return null;
  }
}

/** The saver, or null when the run has to stay ephemeral. Cached per process. */
export async function getCheckpointer(): Promise<PostgresSaver | null> {
  cached ??= build();
  return cached;
}

/** Test seam — the cache is process-wide and would leak between cases. */
export function resetCheckpointerForTests(): void {
  cached = null;
}
