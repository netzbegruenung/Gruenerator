/**
 * Everything that changes a ready project: direct ops from the preview (free,
 * no model), correction rounds with Gemma, going back to a version, handing
 * off to the editor. Each round is a new version on top of the one the page
 * showed (`baseVersion`); a second tab that got there first wins and this one
 * gets a 409.
 */
import {
  VIDEO_AI_MAX_VERSIONS,
  type ApplyVideoAiOpsBody,
  type ReviseVideoAiBody,
  type VideoAiOp,
} from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import {
  getTreeBudget,
  treeBudgetSpentMessage,
  TREE_COST_VIDEO_AI_REVISION,
} from '../trees/index.js';

import { applyOps } from './applyOps.js';
import { planContext, validationContext, type PlanContext } from './projectContext.js';
import { appendVersion, loadOwnProjectRow, type ProjectRow } from './projectRepository.js';
import { type StoredVideoAiAnalysis, type StoredVideoAiVersion } from './projectTypes.js';
import { reviseEdl, type ReviseInput, type Revision } from './reviseEdl.js';
import { buildTimeline } from './timeline.js';
import { validateEdl } from './validateEdl.js';

const log = createLogger('videoAiEditing');

export type EditFailure = { ok: false; status: 400 | 404 | 409 | 429 | 503; error: string };

export const DIRECT_REMOVED_REASON = 'Von dir entfernt';

const fail = (status: EditFailure['status'], error: string): EditFailure => ({
  ok: false,
  status,
  error,
});

const NOT_FOUND = fail(404, 'KI-Schnitt nicht gefunden.');

export interface Editable {
  row: ProjectRow;
  analysis: StoredVideoAiAnalysis;
  current: StoredVideoAiVersion;
  ctx: PlanContext;
}

/** The project if it can take another round on top of `baseVersion`. */
export async function loadEditable(
  id: string,
  userId: string,
  baseVersion: number | null
): Promise<{ ok: true; value: Editable } | EditFailure> {
  const row = await loadOwnProjectRow(id, userId);
  if (!row) return NOT_FOUND;
  const current = row.versions.find((v) => v.version === row.current_version);
  if (row.status !== 'ready' || !row.analysis || !current) {
    return fail(409, 'Der KI-Schnitt ist noch nicht fertig.');
  }
  if (row.handed_off_at !== null) {
    return fail(409, 'Der KI-Schnitt liegt schon im Editor. Änderungen machst du jetzt dort.');
  }
  if (baseVersion !== null && baseVersion !== current.version) {
    return fail(409, 'Inzwischen gibt es eine neuere Version. Lade die Seite neu.');
  }
  if (row.versions.length >= VIDEO_AI_MAX_VERSIONS) {
    return fail(
      409,
      `Mehr als ${VIDEO_AI_MAX_VERSIONS} Versionen gehen nicht. Mach im Editor weiter.`
    );
  }
  return {
    ok: true,
    value: { row, analysis: row.analysis, current, ctx: planContext(row, row.analysis) },
  };
}

function nextVersion(row: ProjectRow): number {
  return Math.max(0, ...row.versions.map((v) => v.version)) + 1;
}

function directSummary(ops: readonly VideoAiOp[]): string {
  if (ops.every((o) => o.kind === 'restore_unit')) return 'Satz zurückgeholt';
  if (ops.every((o) => o.kind === 'set_caption_text')) return 'Untertitel korrigiert';
  if (ops.every((o) => o.kind === 'remove_segment')) return 'Satz entfernt';
  return 'Eigene Änderung';
}

async function store(
  editable: Editable,
  userId: string,
  version: Omit<StoredVideoAiVersion, 'version' | 'createdAt'>
): Promise<{ ok: true; row: ProjectRow } | EditFailure> {
  const row = await appendVersion(editable.row.id, userId, editable.current.version, {
    ...version,
    version: nextVersion(editable.row),
    createdAt: new Date().toISOString(),
  });
  return row
    ? { ok: true, row }
    : fail(409, 'Inzwischen gibt es eine neuere Version. Lade die Seite neu.');
}

export async function applyDirectOps(
  id: string,
  userId: string,
  body: ApplyVideoAiOpsBody
): Promise<{ ok: true; row: ProjectRow } | EditFailure> {
  const loaded = await loadEditable(id, userId, body.baseVersion);
  if (!loaded.ok) return loaded;
  const { value } = loaded;
  const applied = applyOps(value.current.edl, body.ops, {
    units: value.ctx.units,
    omitted: value.current.omitted,
    removedReason: DIRECT_REMOVED_REASON,
  });
  if (!applied.ok) return fail(400, applied.error);
  // The same rules as the first cut, except length: here the person decides.
  const valid = validateEdl(applied.edl, validationContext(value.row, value.ctx, null));
  if (!valid.ok) return fail(400, valid.errors.join(' '));
  return store(value, userId, {
    edl: applied.edl,
    omitted: applied.omitted,
    summary: body.summary ?? directSummary(body.ops),
    rationale: value.current.rationale,
  });
}

export async function reviseProject(
  id: string,
  userId: string,
  body: ReviseVideoAiBody,
  revise: (input: ReviseInput) => Promise<Revision> = reviseEdl
): Promise<{ ok: true; row: ProjectRow; reply: string } | EditFailure> {
  const loaded = await loadEditable(id, userId, body.baseVersion);
  if (!loaded.ok) return loaded;
  const { value } = loaded;

  const budget = getTreeBudget();
  const reservation = await budget.reserve(userId, TREE_COST_VIDEO_AI_REVISION);
  if (!reservation.ok) {
    return reservation.reason === 'exceeded'
      ? fail(429, treeBudgetSpentMessage(reservation.status, TREE_COST_VIDEO_AI_REVISION))
      : fail(503, 'Das Kontingent ist gerade nicht lesbar. Bitte versuch es gleich noch einmal.');
  }
  const refund = () => budget.release(userId, TREE_COST_VIDEO_AI_REVISION, reservation.status.day);

  let revision: Revision;
  try {
    revision = await revise({
      current: value.current,
      timeline: buildTimeline({
        unitIds: value.current.edl.segments.map((s) => s.unitId),
        units: value.ctx.units,
        clipDurations: new Map(value.analysis.clips.map((c) => [c.clipId, c.duration])),
      }),
      ctx: value.ctx,
      validation: validationContext(value.row, value.ctx, null),
      feedback: body.feedback,
      times: body.times ?? [],
      locale: value.row.locale,
    });
  } catch (error) {
    log.warn(`Revision of ${id} failed: ${(error as Error).message}`);
    await refund();
    return fail(
      503,
      'Die Korrektur hat diesmal nicht geklappt. Formulier den Wunsch etwas anders oder ändere es direkt.'
    );
  }

  // The model was asked and answered; the tenth of a Baum stays booked.
  if (!revision.changed) return { ok: true, row: value.row, reply: revision.reply };

  const stored = await store(value, userId, {
    edl: revision.edl,
    omitted: revision.omitted,
    summary: revision.summary,
    rationale: value.current.rationale,
  });
  if (!stored.ok) {
    await refund();
    return stored;
  }
  return { ok: true, row: stored.row, reply: revision.reply };
}
