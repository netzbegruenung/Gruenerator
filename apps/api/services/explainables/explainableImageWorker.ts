/**
 * Draws the illustrations of new explainables, one image after the other.
 *
 * The `explainables` table is the queue: claimed with `FOR UPDATE SKIP LOCKED`,
 * so every cluster process may run this. A claim older than `STALE_CLAIM_MS`
 * counts as abandoned (crashed process) and is taken again, at most
 * `MAX_ATTEMPTS` times; after that the remaining images become failed.
 *
 * Budget: `createExplainable` booked one image's units per image. A drawn image
 * keeps them, a failed one gives them back — through a conditional decrement
 * of `reserved_units`, so a concurrent trash (which releases everything still
 * reserved) can never cause a second release.
 */
import fs from 'node:fs/promises';

import { type ExplainableContent } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { applyKiLabel } from '../../routes/sharepic/sharepic_canvas/imagine_label_canvas.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { runWithUsageContext } from '../../utils/usageContext.js';
import { FluxImageService } from '../flux/index.js';
import { getTreeBudget } from '../trees/index.js';

import { EXPLAINABLE_IMAGE_MODEL, explainableImageUnits } from './createExplainable.js';
import {
  explainableImageDir,
  explainableImagePath,
  FAIL_PENDING_IMAGES_SQL,
} from './explainableRepository.js';

const log = createLogger('ExplainableImages');

export const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 5 * 60 * 1000;
const TICK_INTERVAL_MS = 15_000;
const MAX_ROWS_PER_TICK = 3;
const PROMPT_MAX_CHARS = 900;

export const STYLE_PREFIX =
  'Simple flat vector explanatory illustration, clean geometric shapes, soft muted colors with green accents, plain light background, no text, no letters, no numbers, no logos, no realistic or identifiable people. Scene: ';

export interface ClaimedExplainable {
  id: string;
  user_id: string;
  content: ExplainableContent;
}

export interface ExplainableWorkerDeps {
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };
  release: (userId: string, units: number, day: string) => Promise<unknown>;
  /** Returns the finished, labelled PNG. */
  generateImage: (prompt: string) => Promise<Buffer>;
  writeImage: (id: string, sectionIndex: number, png: Buffer) => Promise<void>;
  unitsPerImage: number;
}

export const CLAIM_SQL = `UPDATE explainables e
    SET claim_at = now(), attempts = e.attempts + 1
  WHERE e.id = (
    SELECT id FROM explainables
     WHERE status = 'images_pending'
       AND deleted_at IS NULL
       AND attempts < $1
       AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)
     ORDER BY created_at
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  RETURNING e.id, e.user_id, e.content`;

/** Out of attempts: the rest of the images will not come — fail them and give back their units. */
export const GIVE_UP_SQL = `WITH old AS (
    SELECT id, reserved_units, reserved_day FROM explainables
     WHERE status = 'images_pending'
       AND deleted_at IS NULL
       AND attempts >= $1
       AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE explainables e
     SET status = 'ready',
         content = ${FAIL_PENDING_IMAGES_SQL},
         reserved_units = 0,
         claim_at = NULL,
         updated_at = now()
    FROM old
   WHERE e.id = old.id
  RETURNING e.id, e.user_id, old.reserved_units, old.reserved_day::text AS reserved_day`;

export const MARK_DONE_SQL = `UPDATE explainables
    SET content = jsonb_set(content, ARRAY['sections', $2::text, 'image', 'status'], '"done"'::jsonb),
        reserved_units = GREATEST(reserved_units - $3, 0),
        updated_at = now()
  WHERE id = $1`;

export const MARK_FAILED_SQL = `UPDATE explainables
    SET content = jsonb_set(content, ARRAY['sections', $2::text, 'image', 'status'], '"failed"'::jsonb),
        updated_at = now()
  WHERE id = $1`;

/** Takes one image's units off the row; a returned row means they are ours to release. */
export const TAKE_UNITS_SQL = `UPDATE explainables
    SET reserved_units = reserved_units - $2
  WHERE id = $1 AND reserved_units >= $2
  RETURNING reserved_day::text AS reserved_day`;

export const FINISH_SQL = `UPDATE explainables
    SET status = 'ready', claim_at = NULL, updated_at = now()
  WHERE id = $1 AND status = 'images_pending'`;

async function releaseOne(row: ClaimedExplainable, deps: ExplainableWorkerDeps): Promise<void> {
  const taken = await deps.db.query<{ reserved_day: string | null }>(TAKE_UNITS_SQL, [
    row.id,
    deps.unitsPerImage,
  ]);
  const day = taken[0]?.reserved_day;
  if (day) await deps.release(row.user_id, deps.unitsPerImage, day);
}

export async function processClaimed(
  row: ClaimedExplainable,
  deps: ExplainableWorkerDeps
): Promise<void> {
  const sections = row.content.sections ?? [];
  for (let i = 0; i < sections.length; i++) {
    const image = sections[i]?.image;
    if (!image || image.status !== 'pending') continue;
    let png: Buffer;
    try {
      png = await deps.generateImage(image.prompt);
      await deps.writeImage(row.id, i, png);
    } catch (error) {
      reportBackgroundError(error, {
        job: 'explainable-image',
        explainableId: row.id,
        section: i,
      });
      await deps.db.query(MARK_FAILED_SQL, [row.id, String(i)]);
      await releaseOne(row, deps);
      continue;
    }
    await deps.db.query(MARK_DONE_SQL, [row.id, String(i), deps.unitsPerImage]);
  }
  await deps.db.query(FINISH_SQL, [row.id]);
}

async function giveUpExhausted(deps: ExplainableWorkerDeps): Promise<number> {
  let count = 0;
  for (;;) {
    const rows = await deps.db.query<{
      id: string;
      user_id: string;
      reserved_units: number;
      reserved_day: string | null;
    }>(GIVE_UP_SQL, [MAX_ATTEMPTS, String(STALE_CLAIM_MS)]);
    const row = rows[0];
    if (!row) return count;
    count++;
    log.warn(`Explainable ${row.id}: out of attempts, remaining images failed`);
    if (row.reserved_units > 0 && row.reserved_day) {
      await deps.release(row.user_id, row.reserved_units, row.reserved_day);
    }
  }
}

export async function drainExplainableImages(
  deps: ExplainableWorkerDeps = defaultDeps(),
  opts: { maxRows?: number } = {}
): Promise<number> {
  await giveUpExhausted(deps);
  const maxRows = opts.maxRows ?? MAX_ROWS_PER_TICK;
  let processed = 0;
  while (processed < maxRows) {
    const rows = await deps.db.query<ClaimedExplainable>(CLAIM_SQL, [
      MAX_ATTEMPTS,
      String(STALE_CLAIM_MS),
    ]);
    const row = rows[0];
    if (!row) break;
    processed++;
    try {
      await runWithUsageContext({ req: { user: { id: row.user_id } }, feature: 'notebook' }, () =>
        processClaimed(row, deps)
      );
    } catch (error) {
      // The claim stays; it is retried once stale, up to MAX_ATTEMPTS.
      reportBackgroundError(error, { job: 'explainable-images', explainableId: row.id });
    }
  }
  return processed;
}

export function buildImagePrompt(prompt: string): string {
  return (STYLE_PREFIX + prompt.trim()).slice(0, PROMPT_MAX_CHARS);
}

export function defaultDeps(): ExplainableWorkerDeps {
  const db = getPostgresInstance();
  const model = EXPLAINABLE_IMAGE_MODEL;
  return {
    db: { query: <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params) },
    release: (userId, units, day) => getTreeBudget().release(userId, units, day),
    generateImage: async (prompt) => {
      const flux = await FluxImageService.create(model.backend, model.modelPath, model.resolution);
      const { stored } = await flux.generateFromPrompt(buildImagePrompt(prompt), {
        width: 1024,
        height: 768,
        output_format: 'jpeg',
        safety_tolerance: 2,
      });
      const raw = await fs.readFile(stored.filePath);
      // swallow-ok: the copy below is the one we keep
      await fs.rm(stored.filePath, { force: true }).catch(() => {});
      return applyKiLabel(raw, 'full');
    },
    writeImage: async (id, sectionIndex, png) => {
      await fs.mkdir(explainableImageDir(id), { recursive: true });
      await fs.writeFile(explainableImagePath(id, sectionIndex), png);
    },
    unitsPerImage: explainableImageUnits(),
  };
}

const worker = createIntervalWorker({
  name: 'ExplainableImages',
  intervalMs: TICK_INTERVAL_MS,
  initialDelayMs: 30_000,
  tick: async () => {
    await drainExplainableImages();
  },
});

export function startExplainableImageWorker(): void {
  worker.start();
}

export function stopExplainableImageWorker(): void {
  worker.stop();
}
