/**
 * Turns queued KI-Schnitt projects into a first plan: analyse the material,
 * let Gemma cut (stage A) and design (stage B), store version 1, notify.
 *
 * `video_ai_projects` is the queue, claimed with `FOR UPDATE SKIP LOCKED`, so
 * every cluster process may run this; one project per tick and process — a
 * job is minutes of ffmpeg and several model calls.
 *
 * Retries continue where the last attempt stopped: the analysis is saved clip
 * by clip, and only the two decisions (seconds, cheap) run again. When a
 * decision gives up after its repair turn, the conservative fallback plan
 * (fallbackPlan.ts) takes its place — the job fails only when the material
 * cannot be analysed. A failed job gives its trees back; a cancelled one
 * stops at the next step.
 */
import { type VideoAiBrief, type VideoAiEdl } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { runWithUsageContext } from '../../utils/usageContext.js';
import { createNotification } from '../notifications/NotificationService.js';
import { getTreeBudget } from '../trees/index.js';

import {
  analyzeAssets,
  analyzeOneClip,
  VideoAiFinalError,
  type AnalyzeJob,
} from './analyzeProject.js';
import { decideCut, type CutDecision, type CutInput } from './decideCut.js';
import { decideDesign, type DesignDecision, type DesignInput } from './decideDesign.js';
import { fallbackCut, fallbackDesign } from './fallbackPlan.js';
import { clipSummary, framingFor, hasBurnedInCaptions } from './framing.js';
import { ACTIVE_STATUSES } from './projectRepository.js';
import {
  type StoredAssetAnalysis,
  type StoredClipAnalysis,
  type StoredVideoAiAnalysis,
  type StoredVideoAiInput,
  type StoredVideoAiVersion,
} from './projectTypes.js';
import { findTakeGroups } from './takeGroups.js';
import { buildTranscriptUnits, type TranscriptUnit } from './transcriptUnits.js';
import { materialWarnings } from './warnings.js';

const log = createLogger('VideoAiWorker');

export const MAX_ATTEMPTS = 3;
/** The claim is renewed after every clip, so this only has to cover one clip. */
const STALE_CLAIM_MS = 15 * 60 * 1000;
const TICK_INTERVAL_MS = 10_000;

export const GENERIC_FAILURE =
  'Der KI-Schnitt konnte nicht erstellt werden. Deine Bäume sind zurückgebucht. ' +
  'Bitte versuch es noch einmal.';

export interface ClaimedProject {
  id: string;
  user_id: string;
  slug_suffix: string;
  title: string;
  locale: 'de-DE' | 'de-AT';
  brief: VideoAiBrief;
  inputs: StoredVideoAiInput[];
  analysis: StoredVideoAiAnalysis | null;
  attempts: number;
  tree_units: number;
  tree_day: string | null;
}

type NotifiedProject = Pick<ClaimedProject, 'id' | 'user_id' | 'slug_suffix' | 'title'>;

export interface VideoAiWorkerDeps {
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };
  analyzeClip: (
    job: AnalyzeJob,
    input: StoredVideoAiInput & { role: 'footage' | 'broll' },
    clipNumber: number
  ) => Promise<StoredClipAnalysis>;
  analyzeAssets: (
    job: AnalyzeJob,
    inputs: readonly StoredVideoAiInput[]
  ) => Promise<StoredAssetAnalysis[]>;
  decideCut: (input: CutInput) => Promise<CutDecision>;
  decideDesign: (input: DesignInput) => Promise<DesignDecision>;
  notify: (row: NotifiedProject, outcome: 'ready' | 'failed') => Promise<void>;
  releaseTrees: (userId: string, units: number, day: string) => Promise<void>;
}

const ACTIVE_LIST = `'${ACTIVE_STATUSES.join("', '")}'`;

export const CLAIM_SQL = `UPDATE video_ai_projects p
    SET claim_at = now(), attempts = p.attempts + 1
  WHERE p.id = (
    SELECT id FROM video_ai_projects
     WHERE status IN (${ACTIVE_LIST})
       AND deleted_at IS NULL
       AND attempts < $1
       AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)
     ORDER BY created_at
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  RETURNING p.id, p.user_id, p.slug_suffix, p.title, p.locale, p.brief, p.inputs, p.analysis,
            p.attempts, p.tree_units, p.tree_day`;

/** Out of attempts after a crash (the claim went stale without an outcome). */
export const GIVE_UP_SQL = `UPDATE video_ai_projects
    SET status = 'failed', error = $3, claim_at = NULL, updated_at = now()
  WHERE status IN (${ACTIVE_LIST})
    AND deleted_at IS NULL
    AND attempts >= $1
    AND (claim_at IS NULL OR claim_at < now() - ($2::text || ' milliseconds')::interval)
  RETURNING id, user_id, slug_suffix, title, tree_units, tree_day`;

/** Only while still wanted: a cancel or a trash in between wins. */
const SET_STATUS_SQL = `UPDATE video_ai_projects
    SET status = $2, claim_at = now(), updated_at = now()
  WHERE id = $1 AND status IN (${ACTIVE_LIST}) AND deleted_at IS NULL
  RETURNING id`;

const SAVE_ANALYSIS_SQL = `UPDATE video_ai_projects
    SET analysis = $2, claim_at = now(), updated_at = now()
  WHERE id = $1 AND status IN (${ACTIVE_LIST}) AND deleted_at IS NULL
  RETURNING id`;

const FINISH_SQL = `UPDATE video_ai_projects
    SET status = 'ready', versions = $2, current_version = 1, warnings = $3, error = NULL,
        claim_at = NULL, updated_at = now()
  WHERE id = $1 AND status IN (${ACTIVE_LIST}) AND deleted_at IS NULL
  RETURNING id`;

const FAIL_SQL = `UPDATE video_ai_projects
    SET status = 'failed', error = $2, tree_units = 0, claim_at = NULL, updated_at = now()
  WHERE id = $1 AND status IN (${ACTIVE_LIST})
  RETURNING id`;

const RELEASE_SQL = `UPDATE video_ai_projects SET claim_at = NULL, updated_at = now() WHERE id = $1`;

/** The person cancelled or trashed the project; nothing more to do. */
export class NoLongerWantedError extends Error {
  constructor() {
    super('KI-Schnitt was cancelled or trashed');
    this.name = 'NoLongerWantedError';
  }
}

async function guarded(deps: VideoAiWorkerDeps, sql: string, params: unknown[]): Promise<void> {
  const rows = await deps.db.query<{ id: string }>(sql, params);
  if (rows.length === 0) throw new NoLongerWantedError();
}

function isClip(i: StoredVideoAiInput): i is StoredVideoAiInput & { role: 'footage' | 'broll' } {
  return i.role === 'footage' || i.role === 'broll';
}

/** Missing clips one by one, each saved before the next starts. */
export async function completeAnalysis(
  row: ClaimedProject,
  deps: VideoAiWorkerDeps
): Promise<StoredVideoAiAnalysis> {
  const job: AnalyzeJob = {
    userId: row.user_id,
    title: row.title,
    brief: row.brief,
    inputs: row.inputs,
  };
  let analysis = row.analysis;
  if (!analysis) {
    analysis = { clips: [], assets: await deps.analyzeAssets(job, row.inputs) };
    await guarded(deps, SAVE_ANALYSIS_SQL, [row.id, JSON.stringify(analysis)]);
  }
  const clips = row.inputs.filter(isClip);
  for (const [i, input] of clips.entries()) {
    if (analysis.clips.some((c) => c.clipId === input.id)) continue;
    const clip = await deps.analyzeClip(job, input, i + 1);
    analysis = { ...analysis, clips: [...analysis.clips, clip] };
    await guarded(deps, SAVE_ANALYSIS_SQL, [row.id, JSON.stringify(analysis)]);
  }
  return analysis;
}

interface PlanContext {
  units: Map<string, TranscriptUnit>;
  ordered: TranscriptUnit[];
  cutInput: CutInput;
  designBase: Omit<DesignInput, 'cut'>;
}

export function planContext(row: ClaimedProject, analysis: StoredVideoAiAnalysis): PlanContext {
  const titles = new Map(row.inputs.map((i) => [i.id, i.title]));
  const footage = analysis.clips.filter((c) => c.role === 'footage');
  const ordered = footage.flatMap((c) => buildTranscriptUnits(c.clipId, c.words));
  const units = new Map(ordered.map((u) => [u.id, u]));
  const cellsByClip = new Map(analysis.clips.map((c) => [c.clipId, c.cells]));
  const assets = analysis.assets.map((a) => ({ id: a.id, kind: a.kind }));
  const brief = {
    topic: row.brief.topic,
    format: row.brief.format,
    target: row.brief.target,
    hints: row.brief.hints ?? null,
    locale: row.locale,
  };
  return {
    units,
    ordered,
    cutInput: {
      brief,
      clips: analysis.clips.map((c) => ({
        id: c.clipId,
        role: c.role,
        duration: c.duration,
        quality: c.detectors.quality,
      })),
      units,
      takes: findTakeGroups(ordered),
      assets,
    },
    designBase: {
      brief: {
        ...brief,
        style: row.brief.style,
        person: row.brief.person
          ? { name: row.brief.person.name, role: row.brief.person.role || null }
          : null,
      },
      units,
      clips: analysis.clips.map((c) => ({
        id: c.clipId,
        role: c.role,
        duration: c.duration,
        summary: clipSummary(c.cells),
      })),
      assets: analysis.assets.map((a) => ({
        ...a,
        label: titles.get(a.id) ?? a.id,
      })),
      framing: new Map(ordered.map((u) => [u.id, framingFor(u, cellsByClip.get(u.clipId) ?? [])])),
      burnedInCaptions: hasBurnedInCaptions(footage.flatMap((c) => c.cells)),
    },
  };
}

/** Gemma first, the fallback plan when a stage gives up. */
export async function decidePlan(
  row: ClaimedProject,
  analysis: StoredVideoAiAnalysis,
  deps: VideoAiWorkerDeps
): Promise<StoredVideoAiVersion> {
  const ctx = planContext(row, analysis);
  const fallback = (unitIds: readonly string[]): VideoAiEdl =>
    fallbackDesign({
      unitIds,
      units: ctx.units,
      framing: ctx.designBase.framing,
      style: row.brief.style,
      format: row.brief.format,
      person: row.brief.person ?? null,
      burnedInCaptions: ctx.designBase.burnedInCaptions,
    });
  const version = (edl: VideoAiEdl, omitted: Record<string, string>, rationale: string | null) => ({
    version: 1,
    edl,
    summary: 'Erster Schnitt',
    omitted,
    rationale,
    createdAt: new Date().toISOString(),
  });

  await guarded(deps, SET_STATUS_SQL, [row.id, 'cutting']);
  let cut: CutDecision;
  try {
    cut = await deps.decideCut(ctx.cutInput);
  } catch (error) {
    log.warn(`KI-Schnitt ${row.id}: cut fell back (${(error as Error).message})`);
    const plan = fallbackCut(ctx.ordered, ctx.cutInput.takes);
    return version(fallback(plan.unitIds), plan.omitted, plan.rationale);
  }

  await guarded(deps, SET_STATUS_SQL, [row.id, 'designing']);
  try {
    const design = await deps.decideDesign({ ...ctx.designBase, cut });
    return version(design.edl, cut.omitted, cut.rationale || null);
  } catch (error) {
    log.warn(`KI-Schnitt ${row.id}: design fell back (${(error as Error).message})`);
    return version(fallback(cut.unitIds), cut.omitted, cut.rationale || null);
  }
}

export async function processClaimed(row: ClaimedProject, deps: VideoAiWorkerDeps): Promise<void> {
  await guarded(deps, SET_STATUS_SQL, [row.id, 'analyzing']);
  const analysis = await completeAnalysis(row, deps);
  const footageWords = analysis.clips
    .filter((c) => c.role === 'footage')
    .reduce((n, c) => n + c.words.length, 0);
  const warnings = materialWarnings(
    analysis.clips,
    new Map(row.inputs.map((i) => [i.id, i.title]))
  );
  if (footageWords === 0) {
    throw new VideoAiFinalError(
      'In den Videos wird nichts gesprochen. Der KI-Schnitt braucht mindestens ein Video mit Sprache.'
    );
  }
  const version = await decidePlan(row, analysis, deps);
  await guarded(deps, FINISH_SQL, [row.id, JSON.stringify([version]), JSON.stringify(warnings)]);
  await deps.notify(row, 'ready');
}

async function fail(row: ClaimedProject, message: string, deps: VideoAiWorkerDeps): Promise<void> {
  const rows = await deps.db.query<{ id: string }>(FAIL_SQL, [row.id, message]);
  if (rows.length === 0) return;
  if (row.tree_units > 0 && row.tree_day) {
    await deps.releaseTrees(row.user_id, row.tree_units, row.tree_day);
  }
  await deps.notify(row, 'failed');
}

/** Decides what a failed attempt means for the row: final, or another try. */
export async function handleFailure(
  row: ClaimedProject,
  error: unknown,
  deps: VideoAiWorkerDeps
): Promise<void> {
  if (error instanceof NoLongerWantedError) return;
  if (error instanceof VideoAiFinalError) {
    await fail(row, error.message, deps);
    return;
  }
  reportBackgroundError(error, { job: 'video_ai', projectId: row.id, attempt: row.attempts });
  if (row.attempts >= MAX_ATTEMPTS) {
    await fail(row, GENERIC_FAILURE, deps);
    return;
  }
  await deps.db.query(RELEASE_SQL, [row.id]);
}

export async function drainVideoAiProjects(
  deps: VideoAiWorkerDeps = defaultDeps()
): Promise<boolean> {
  const givenUp = await deps.db.query<
    Pick<ClaimedProject, 'id' | 'user_id' | 'slug_suffix' | 'title' | 'tree_units' | 'tree_day'>
  >(GIVE_UP_SQL, [MAX_ATTEMPTS, String(STALE_CLAIM_MS), GENERIC_FAILURE]);
  for (const row of givenUp) {
    if (row.tree_units > 0 && row.tree_day) {
      await deps.releaseTrees(row.user_id, row.tree_units, row.tree_day);
    }
    await deps.notify(row, 'failed');
  }

  const rows = await deps.db.query<ClaimedProject>(CLAIM_SQL, [
    MAX_ATTEMPTS,
    String(STALE_CLAIM_MS),
  ]);
  const row = rows[0];
  if (!row) return false;
  try {
    await runWithUsageContext({ req: { user: { id: row.user_id } }, feature: 'video_ai' }, () =>
      processClaimed(row, deps)
    );
  } catch (error) {
    log.warn(`KI-Schnitt ${row.id} attempt ${row.attempts} failed: ${(error as Error).message}`);
    await handleFailure(row, error, deps);
  }
  return true;
}

function projectUrl(row: NotifiedProject): string {
  return `/studio/ki-schnitt/${row.slug_suffix}`;
}

export function defaultDeps(): VideoAiWorkerDeps {
  const db = getPostgresInstance();
  return {
    db: { query: <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params) },
    analyzeClip: analyzeOneClip,
    analyzeAssets,
    decideCut: (input) => decideCut(input),
    decideDesign: (input) => decideDesign(input),
    notify: async (row, outcome) => {
      await createNotification({
        userId: row.user_id,
        type: outcome === 'ready' ? 'video_ai_ready' : 'video_ai_failed',
        title: outcome === 'ready' ? 'Dein KI-Schnitt ist fertig' : 'KI-Schnitt fehlgeschlagen',
        body:
          outcome === 'ready'
            ? `„${row.title}“ wartet in der Vorschau auf dich.`
            : `„${row.title}“ konnte nicht erstellt werden.`,
        metadata: { videoAiProjectId: row.id },
        actionUrl: projectUrl(row),
      }).catch((error: unknown) => {
        log.warn(`Notification for ${row.id} failed: ${(error as Error).message}`);
        return null;
      });
    },
    releaseTrees: async (userId, units, day) => {
      await getTreeBudget().release(userId, units, day);
    },
  };
}

const worker = createIntervalWorker({
  name: 'VideoAi',
  intervalMs: TICK_INTERVAL_MS,
  initialDelayMs: 25_000,
  tick: async () => {
    await drainVideoAiProjects();
  },
});

export function startVideoAiWorker(): void {
  worker.start();
}

export function stopVideoAiWorker(): void {
  worker.stop();
}
