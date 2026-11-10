/**
 * ts-rest router for the KI-Schnitt. requireAuth sits at the `/api/video-ai`
 * prefix in routes.ts; `create` additionally behind aiGenerationLimiter +
 * requireAiConsent. The work happens in services/videoAi/videoAiWorker.ts.
 */
import { videoAiContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { getSharedMediaService } from '../../services/sharedMediaService.js';
import { probeVideoMetadata } from '../../services/subtitler/videoMetadata.js';
import {
  getTreeBudget,
  treeBudgetSpentMessage,
  treeCostForVideoAiSeconds,
} from '../../services/trees/index.js';
import { checkMaterial } from '../../services/videoAi/material.js';
import { applyDirectOps, reviseProject } from '../../services/videoAi/projectEditing.js';
import {
  cancelVideoAiProject,
  getOwnVideoAiProject,
  hasActiveProject,
  insertVideoAiProject,
  listOwnVideoAiProjects,
  loadOwnMedia,
  loadOwnProjectRow,
  markHandedOff,
  selectVersion,
  shareTokensFor,
  toProjectDto,
  trashVideoAiProject,
  type MediaForInput,
} from '../../services/videoAi/projectRepository.js';
import { compileTimeline } from '../../services/videoAi/projectTimeline.js';
import { importUpload } from '../../services/videoAi/uploadImport.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('videoAiContract');
const s = initServer();

const NOT_FOUND = { status: 404 as const, body: { error: 'KI-Schnitt nicht gefunden.' } };

/** Takes any request shape: coerced numeric params do not fit Express's own `Request`. */
function getUser(req: Pick<Request, 'user'>): UserProfile {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user;
}

/** Lengths for videos whose Mediathek row has none; unreadable ones stay missing. */
async function probeMissingDurations(
  media: readonly MediaForInput[]
): Promise<Map<string, number>> {
  const durations = new Map<string, number>();
  const service = getSharedMediaService();
  for (const row of media) {
    if (row.media_type !== 'video' || row.duration !== null) continue;
    const file = service.getMediaFilePath(row.file_path);
    if (!file) continue;
    try {
      const duration = Number((await probeVideoMetadata(file)).duration);
      if (Number.isFinite(duration) && duration > 0) durations.set(row.id, duration);
    } catch (error) {
      log.warn(`Probe of media ${row.id} failed: ${(error as Error).message}`);
    }
  }
  return durations;
}

export const videoAiContractRouter = s.router(videoAiContract, {
  create: async ({ req, body }) => {
    const user = getUser(req);
    if (await hasActiveProject(user.id)) {
      return {
        status: 409 as const,
        body: { error: 'Ein KI-Schnitt läuft schon. Warte, bis er fertig ist, oder brich ihn ab.' },
      };
    }

    const media = await loadOwnMedia(
      user.id,
      body.inputs.map((i) => i.mediaId)
    );
    const material = checkMaterial(body.inputs, media, await probeMissingDurations(media));
    if (!material.ok) return { status: 400 as const, body: { error: material.error } };

    const units = treeCostForVideoAiSeconds(material.clipSeconds);
    const reservation = await getTreeBudget().reserve(user.id, units);
    if (!reservation.ok) {
      return reservation.reason === 'exceeded'
        ? {
            status: 429 as const,
            body: { error: treeBudgetSpentMessage(reservation.status, units) },
          }
        : {
            status: 503 as const,
            body: {
              error: 'Das Kontingent ist gerade nicht lesbar. Bitte versuch es gleich noch einmal.',
            },
          };
    }

    let created: { id: string; slugSuffix: string };
    try {
      created = await insertVideoAiProject({
        userId: user.id,
        brief: body.brief,
        inputs: material.inputs,
        locale: extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE',
        treeUnits: units,
        treeDay: reservation.status.day,
      });
    } catch (error) {
      await getTreeBudget().release(user.id, units, reservation.status.day);
      throw error;
    }
    log.info(
      `KI-Schnitt ${created.id} queued (${material.clipSeconds.toFixed(0)} s, ${units} units)`
    );
    return { status: 202 as const, body: created };
  },

  importUpload: async ({ req, body }) => {
    const result = await importUpload(getUser(req).id, body.uploadId, body.title ?? null);
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return {
      status: 201 as const,
      body: {
        mediaId: result.mediaId,
        mediaType: result.mediaType,
        title: result.title,
        durationSeconds: result.durationSeconds,
      },
    };
  },

  list: async ({ req }) => ({
    status: 200 as const,
    body: { projects: await listOwnVideoAiProjects(getUser(req).id) },
  }),

  get: async ({ req, params }) => {
    const project = await getOwnVideoAiProject(params.ref, getUser(req).id);
    return project ? { status: 200 as const, body: project } : NOT_FOUND;
  },

  cancel: async ({ req, params }) => {
    const userId = getUser(req).id;
    const cancelled = await cancelVideoAiProject(params.id, userId);
    if (cancelled) {
      if (cancelled.refundUnits > 0 && cancelled.treeDay) {
        await getTreeBudget().release(userId, cancelled.refundUnits, cancelled.treeDay);
      }
      return { status: 200 as const, body: { success: true as const } };
    }
    return (await getOwnVideoAiProject(params.id, userId))
      ? { status: 409 as const, body: { error: 'Der KI-Schnitt läuft nicht mehr.' } }
      : NOT_FOUND;
  },

  applyOps: async ({ req, params, body }) => {
    const result = await applyDirectOps(params.id, getUser(req).id, body);
    return result.ok
      ? { status: 200 as const, body: toProjectDto(result.row) }
      : { status: result.status as 400 | 404 | 409, body: { error: result.error } };
  },

  revise: async ({ req, params, body }) => {
    const result = await reviseProject(params.id, getUser(req).id, body);
    return result.ok
      ? { status: 200 as const, body: { project: toProjectDto(result.row), reply: result.reply } }
      : { status: result.status as 404 | 409 | 429 | 503, body: { error: result.error } };
  },

  selectVersion: async ({ req, params }) => {
    const userId = getUser(req).id;
    const row = await selectVersion(params.id, userId, params.version);
    if (row) return { status: 200 as const, body: toProjectDto(row) };
    return (await loadOwnProjectRow(params.id, userId))
      ? { status: 409 as const, body: { error: 'Diese Version lässt sich nicht wählen.' } }
      : NOT_FOUND;
  },

  handOff: async ({ req, params }) => {
    const userId = getUser(req).id;
    const row = await markHandedOff(params.id, userId);
    if (row) return { status: 200 as const, body: toProjectDto(row) };
    return (await loadOwnProjectRow(params.id, userId))
      ? { status: 409 as const, body: { error: 'Der KI-Schnitt ist noch nicht fertig.' } }
      : NOT_FOUND;
  },

  timeline: async ({ req, params, query }) => {
    const userId = getUser(req).id;
    const row = await loadOwnProjectRow(params.id, userId);
    if (!row) return NOT_FOUND;
    const wanted = query.version ?? row.current_version;
    const version = row.versions.find((v) => v.version === wanted);
    if (!row.analysis || !version) {
      return { status: 409 as const, body: { error: 'Diese Version gibt es (noch) nicht.' } };
    }
    const tokens = await shareTokensFor(
      userId,
      row.inputs.map((i) => i.mediaId)
    );
    return { status: 200 as const, body: compileTimeline(row, row.analysis, version, tokens) };
  },

  remove: async ({ req, params }) => {
    // 'forbidden' answers like 'not_found': someone else's project does not exist for you.
    const result = await trashVideoAiProject(getUser(req).id, params.id);
    return result === 'ok' ? { status: 200 as const, body: { success: true as const } } : NOT_FOUND;
  },
});

export function mountVideoAiContractRouter(app: Application): void {
  createExpressEndpoints(videoAiContract, videoAiContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'videoAiContract'),
  });
}
