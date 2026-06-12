/**
 * Chat reel branch: subtitle editing of subtitler projects ("reels") plus
 * the two attachment paths that get a reel into the chat in the first place.
 *
 * Three sub-flows, all handled by `handleReelEdit`:
 *   1. Upload — the composer attached a video (already TUS-uploaded):
 *      start the auto-processing pipeline (same one the Sub-Studio uses,
 *      auto-creates a project) and end the turn; the frontend polls
 *      GET /subtitler/auto-progress/:uploadId via the ReelProcessingCard.
 *   2. Picker — reel-edit intent but no reel attached to the thread:
 *      stream the user's recent projects as a `reel_picker` event; the pick
 *      happens client-side and arrives as `currentReel` on the next turn.
 *   3. Edit — fetch the project's subtitle blob fresh, one tool-forced LLM
 *      call for text-only operations, validate, write back via
 *      ProjectService.updateProject, emit `reel_updated` with the full
 *      segment set.
 *
 * Context discipline mirrors sharepicEditService: thread messages only ever
 * store compact tool results ({projectId, title, summary, changedIndices});
 * full segments travel to the client via SSE only.
 */
import {
  formatTimeWithFraction,
  parseStoredSubtitles,
  serializeStoredSubtitles,
} from '@gruenerator/shared/subtitle-editor';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { startAutoProcessing } from '../../../services/subtitler/autoProcessingService.js';
import {
  getSubtitlerProjectService,
  type SubtitlerProject,
} from '../../../services/subtitler/index.js';
import {
  checkFileExists,
  getFilePathFromUploadId,
  getOriginalFilename,
} from '../../../services/subtitler/tusService.js';
import { createLogger } from '../../../utils/logger.js';

import { hasStrongReelNoun } from './reelEditHeuristics.js';
import { runReelEdit } from './reelEditLlm.js';
import { applyReelOps, validateReelOps } from './reelEditOps.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type { ReelPickerProject } from '@gruenerator/contracts';

const log = createLogger('ReelEdit');

export { isReelEditInstruction, hasReelEditVerb, hasStrongReelNoun } from './reelEditHeuristics.js';

const PICKER_PROJECT_LIMIT = 10;
/** Guard against pathological projects blowing up the prompt; reels are short. */
const MAX_PROMPT_SEGMENTS = 150;

/**
 * Subtitle transcript of the active reel as a context block for the NORMAL
 * chat pipeline. Injected into `attachmentContext` whenever a reel is
 * attached but the turn is NOT a subtitle edit, so follow-ups like "schreib
 * mir einen Insta-Post dazu" or "fass das Video zusammen" can work from the
 * actual spoken content. Returns null when the project can't be resolved or
 * has no subtitles — callers skip injection silently.
 */
export async function buildReelContextBlock(
  userId: string,
  projectId: string
): Promise<string | null> {
  try {
    const project = await getSubtitlerProjectService().getProject(userId, projectId);
    const { segments } = parseStoredSubtitles(project.subtitles);
    if (segments.length === 0) return null;

    const lines = segments
      .slice(0, MAX_PROMPT_SEGMENTS)
      .map(
        (s) =>
          `[${formatTimeWithFraction(s.startTime)}–${formatTimeWithFraction(s.endTime)}] ${s.text}`
      );
    return [
      `Untertitel-Transkript des aktiven Reels "${project.title}" (gesprochener Videoinhalt):`,
      ...lines,
    ].join('\n');
  } catch (err) {
    log.warn(`[ReelEdit] Could not build reel context for ${projectId}: ${err}`);
    return null;
  }
}

export interface HandleReelEditArgs {
  sse: SSEWriter;
  req: unknown;
  threadId: string;
  userId: string;
  instruction: string;
  currentReel: { projectId: string } | null;
  reelUpload: { uploadId: string; filename: string } | null;
  userLocale: string;
  aiWorkerPool: AIWorkerPool;
  startTime: number;
  classificationTimeMs?: number;
}

/** Stream a fixed reply, persist it, and close the turn. */
async function finishWithText(
  args: HandleReelEditArgs,
  text: string,
  toolCalls?: Record<string, unknown>[]
): Promise<void> {
  const { sse, threadId } = args;
  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  sse.send('text_delta', { text });
  sse.sendRaw('done', {
    threadId,
    citations: [],
    metadata: {
      intent: 'reel_edit',
      searchCount: 0,
      totalTimeMs: Date.now() - args.startTime,
      ...(args.classificationTimeMs != null && {
        classificationTimeMs: args.classificationTimeMs,
      }),
      searchTimeMs: 0,
    },
  });
  try {
    await createMessage(threadId, 'assistant', text, {
      intent: 'reel_edit',
      ...(toolCalls ? { toolCalls } : {}),
    });
    await touchThread(threadId);
  } catch (err) {
    log.error('[ReelEdit] Failed to persist message:', err);
  }
  sse.end();
}

interface ThreadReelRow {
  project_id: string;
  is_active: boolean;
}

async function findActiveThreadReel(threadId: string): Promise<string | null> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT project_id, is_active FROM chat_thread_reels
     WHERE thread_id = $1 ORDER BY updated_at DESC`,
    [threadId]
  )) as ThreadReelRow[];
  const active = rows.find((r) => r.is_active) ?? rows[0];
  return active?.project_id ?? null;
}

/** Bind the project to the thread and mark it the active reel target. */
async function setActiveThreadReel(threadId: string, projectId: string): Promise<void> {
  const pg = getPostgresInstance();
  await pg.query(
    `INSERT INTO chat_thread_reels (thread_id, project_id, is_active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (thread_id, project_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [threadId, projectId]
  );
  await pg.query(
    `UPDATE chat_thread_reels
     SET is_active = (project_id = $2), updated_at = CURRENT_TIMESTAMP
     WHERE thread_id = $1`,
    [threadId, projectId]
  );
}

/**
 * Resolve which project the instruction targets: explicit `currentReel`
 * selection → the thread's active reel → null (picker path).
 * Ownership is enforced by ProjectService (user-scoped queries).
 */
async function resolveReelTarget(
  threadId: string,
  userId: string,
  currentReel: { projectId: string } | null
): Promise<SubtitlerProject | null> {
  const service = getSubtitlerProjectService();

  if (currentReel) {
    try {
      return await service.getProject(userId, currentReel.projectId);
    } catch {
      log.warn(`[ReelEdit] currentReel ${currentReel.projectId} not resolvable for user`);
      return null;
    }
  }

  const activeProjectId = await findActiveThreadReel(threadId);
  if (!activeProjectId) return null;
  try {
    return await service.getProject(userId, activeProjectId);
  } catch {
    log.warn(`[ReelEdit] thread reel ${activeProjectId} no longer resolvable — falling back`);
    return null;
  }
}

interface PickerRow {
  id: string;
  title: string;
  updated_at: Date | string | null;
  last_edited_at: Date | string | null;
  thumbnail_path: string | null;
  has_subtitles: boolean;
}

async function listPickerProjects(userId: string): Promise<ReelPickerProject[]> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT id, title, updated_at, last_edited_at, thumbnail_path,
            (subtitles IS NOT NULL
             AND length(trim(subtitles)) > 0
             AND trim(subtitles) <> '[]') AS has_subtitles
     FROM subtitler_projects
     WHERE user_id = $1
     ORDER BY last_edited_at DESC NULLS LAST
     LIMIT ${PICKER_PROJECT_LIMIT}`,
    [userId]
  )) as PickerRow[];

  return rows.map((row) => {
    const updated = row.last_edited_at ?? row.updated_at;
    return {
      projectId: row.id,
      title: row.title,
      updatedAt: updated instanceof Date ? updated.toISOString() : String(updated ?? ''),
      thumbnailUrl: row.thumbnail_path ? `/api/subtitler/projects/${row.id}/thumbnail` : null,
      hasSubtitles: row.has_subtitles,
    };
  });
}

/** Summaries of the thread's most recent reel edits (pronoun context). */
async function listRecentEditSummaries(threadId: string): Promise<string[]> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT 20`,
    [threadId]
  )) as Array<{ tool_results: unknown }>;

  const summaries: string[] = [];
  for (const row of rows) {
    const meta = (
      typeof row.tool_results === 'string' ? JSON.parse(row.tool_results) : row.tool_results
    ) as { toolCalls?: Array<{ toolName?: string; result?: { summary?: unknown } }> } | null;
    for (const tc of meta?.toolCalls ?? []) {
      if (tc?.toolName === 'reel_edit' && typeof tc.result?.summary === 'string') {
        summaries.push(tc.result.summary);
        if (summaries.length >= 2) return summaries;
      }
    }
  }
  return summaries;
}

/**
 * Run a full reel turn (upload kick-off, picker, or edit). Returns true when
 * the turn was handled (stream closed) — the router then returns without
 * running stages 2–4. Returns false to fall through to the other branches.
 */
export async function handleReelEdit(args: HandleReelEditArgs): Promise<boolean> {
  const { sse, req, threadId, userId, instruction, currentReel, reelUpload, aiWorkerPool } = args;

  try {
    // ── 1. Upload path: kick off auto-transcription, end the turn ──────────
    if (reelUpload) {
      const videoPath = getFilePathFromUploadId(reelUpload.uploadId);
      if (!(await checkFileExists(videoPath))) {
        await finishWithText(
          args,
          'Ich konnte das hochgeladene Video nicht mehr finden. Lade es bitte noch einmal hoch.'
        );
        return true;
      }
      const originalFilename =
        (await getOriginalFilename(reelUpload.uploadId)) || reelUpload.filename || 'video.mp4';

      await startAutoProcessing({
        uploadId: reelUpload.uploadId,
        videoPath,
        originalFilename,
        userId,
        locale: args.userLocale,
      });

      sse.send('reel_processing', { uploadId: reelUpload.uploadId, filename: originalFilename });
      await finishWithText(
        args,
        'Ich erstelle gerade die Untertitel für dein Video — das dauert je nach Länge ' +
          'etwa eine Minute. Sobald sie fertig sind, kannst du mir hier Textänderungen sagen.',
        [
          {
            toolCallId: `tc_${Date.now()}`,
            toolName: 'reel_processing',
            args: { query: instruction },
            result: { uploadId: reelUpload.uploadId, filename: originalFilename },
          },
        ]
      );
      return true;
    }

    // ── 2. Resolve target; no target → picker (or fall through) ───────────
    const project = await resolveReelTarget(threadId, userId, currentReel);

    if (!project) {
      // Generic nouns ("Segment 2 kürzen") without any reel context likely
      // mean a sharepic — let the sharepic branch have the turn.
      if (!hasStrongReelNoun(instruction)) return false;

      const projects = await listPickerProjects(userId);
      if (projects.length === 0) {
        await finishWithText(
          args,
          'Du hast noch keine Reels mit Untertiteln. Häng ein Video an deine Nachricht an, ' +
            'dann erstelle ich die Untertitel — oder lade eines im Untertitel-Studio hoch.'
        );
        return true;
      }

      sse.send('reel_picker', { projects });
      await finishWithText(
        args,
        'Welches Reel soll ich bearbeiten? Wähl unten eines aus und schick mir die Änderung dann noch einmal.',
        [
          {
            toolCallId: `tc_${Date.now()}`,
            toolName: 'reel_picker',
            args: { query: instruction },
            result: { projects },
          },
        ]
      );
      return true;
    }

    // ── 3. Edit path ───────────────────────────────────────────────────────
    const { segments, format } = parseStoredSubtitles(project.subtitles);
    if (segments.length === 0) {
      await finishWithText(
        args,
        `Das Reel "${project.title}" hat noch keine Untertitel. Erstelle sie zuerst im Untertitel-Studio.`
      );
      return true;
    }

    if (segments.length > MAX_PROMPT_SEGMENTS) {
      log.warn(
        `[ReelEdit] Project ${project.id} has ${segments.length} segments — capping prompt at ${MAX_PROMPT_SEGMENTS}`
      );
    }
    const promptSegments = segments.slice(0, MAX_PROMPT_SEGMENTS);

    sse.send('progress_step', {
      stepId: `reel_edit_${Date.now()}`,
      toolName: 'reel_edit',
      title: 'Bearbeite Untertitel…',
      status: 'in_progress',
    });

    const recentEditSummaries = await listRecentEditSummaries(threadId);

    const editResult = await runReelEdit({
      instruction,
      segments: promptSegments,
      recentEditSummaries,
      aiWorkerPool,
      req,
    });

    if (!editResult.ok) {
      sse.send('reel_edit_error', { projectId: project.id, error: editResult.error });
      await finishWithText(
        args,
        'Die Änderung hat leider nicht geklappt. Magst du sie anders formulieren?'
      );
      return true;
    }

    const { operations, summary, reply } = editResult.edit;
    const { byIndex, rejected } = validateReelOps(operations, segments.length);

    if (byIndex.size === 0) {
      sse.send('reel_edit_error', {
        projectId: project.id,
        error: rejected[0] ?? 'Keine anwendbare Änderung',
      });
      await finishWithText(
        args,
        'Ich konnte daraus keine Änderung ableiten. Sag mir am besten, welches Segment ich wie ändern soll.'
      );
      return true;
    }
    if (rejected.length > 0) {
      log.warn(`[ReelEdit] Rejected ops: ${rejected.join(' | ')}`);
    }

    const applied = applyReelOps(segments, byIndex);

    const service = getSubtitlerProjectService();
    await service.updateProject(userId, project.id, {
      subtitles: serializeStoredSubtitles(applied.segments, format),
    });
    await setActiveThreadReel(threadId, project.id);

    sse.send('reel_updated', {
      projectId: project.id,
      title: project.title,
      segments: applied.segments,
      summary,
      changedIndices: applied.changedIndices,
    });

    log.info(
      `[ReelEdit] Applied ${applied.changedIndices.length} text change(s) on project ${project.id}`
    );

    await finishWithText(args, reply, [
      {
        toolCallId: `tc_${Date.now()}`,
        toolName: 'reel_edit',
        args: { query: instruction },
        result: {
          projectId: project.id,
          title: project.title,
          summary,
          changedIndices: applied.changedIndices,
        },
      },
    ]);

    return true;
  } catch (error) {
    log.error('[ReelEdit] Turn failed:', error);
    if (!sse.isEnded()) {
      sse.send('reel_edit_error', {
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
      await finishWithText(
        args,
        'Bei der Bearbeitung ist etwas schiefgelaufen. Versuch es bitte noch einmal.'
      );
    }
    return true;
  }
}
