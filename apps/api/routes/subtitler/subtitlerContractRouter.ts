/**
 * ts-rest contract router for subtitler endpoints — the full JSON surface.
 *
 * Covers every JSON boundary of the subtitler (see subtitlerContract):
 *   - processing: process, result, compression-status, export, export-segments,
 *     export-progress, process-auto, auto-progress, cleanup, export-token
 *   - project CRUD + track-export
 *   - share: create, from-project, my, public info, delete
 *   - social-text generation
 *
 * Mount BEFORE the legacy (binary-only) routers in routes.ts.
 * Project + share-mutation routes require authentication (`req.user`);
 * `requireAuth` is applied at the `/api/subtitler/projects` prefix in routes.ts,
 * and the individual share/social handlers check `req.user` themselves.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';

import { AI_CONSENT_REQUIRED_CODE, subtitlerContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { sessionHasAiConsent } from '../../middleware/requireAiConsent.js';
import { aiText } from '../../services/ai/generate.js';
import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../services/localization/index.js';
import { buildReelThumbnailUrl } from '../../services/media/thumbnailUrl.js';
import { checkSpeechAccess, viewerFromRequest } from '../../services/parteitage/access.js';
import {
  getConventionById,
  getSpeech,
  hasGrant,
} from '../../services/parteitage/parteitageRepository.js';
import { downloadBaseName, getMedia } from '../../services/parteitage/parteitageViews.js';
import { startAutoProcessing } from '../../services/subtitler/autoProcessingService.js';
import { getCompressionStatus } from '../../services/subtitler/backgroundCompressionService.js';
import { generateDownloadToken } from '../../services/subtitler/downloadUtils.js';
import {
  startSubtitledVideoExport,
  startTranscriptionJob,
} from '../../services/subtitler/processingJobService.js';
import { saveOrUpdateProject } from '../../services/subtitler/projectSavingService.js';
import {
  parseAutoProgress,
  parseExportProgress,
  parseRedisJobResult,
} from '../../services/subtitler/redisCodecs.js';
import { triggerBackgroundRender } from '../../services/subtitler/shareRenderService.js';
import { getSubtitlerShareService } from '../../services/subtitler/shareService.js';
import {
  checkFileExists,
  getFilePathFromUploadId,
  getOriginalFilename,
  scheduleImmediateCleanup,
} from '../../services/subtitler/tusService.js';
import { getSystemMediaStorage } from '../../services/systemMedia/storage.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { SubtitlerProjectService } from '../../services/subtitler/ProjectService.js';
import type SubtitlerShareService from '../../services/subtitler/shareService.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('subtitlerContractRouter');
const fsPromises = fs.promises;

function getUserId(req: Request): string | undefined {
  const user = req.user as UserProfile | undefined;
  return user?.id;
}

/**
 * Drizzle hands back TIMESTAMPTZ columns as `Date`; the contract declares them
 * as strings, because a string is what the client can ever receive. Express
 * would serialise them implicitly on the way out — doing it here instead makes
 * the handler's type equal the wire, so the contract stays provable rather than
 * merely plausible.
 */
interface ProjectRowDates {
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  last_edited_at?: Date | string | null;
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function toIsoProjectDates<T extends ProjectRowDates>(
  project: T
): Omit<T, 'created_at' | 'updated_at' | 'last_edited_at'> & {
  created_at: string | null;
  updated_at: string | null;
  last_edited_at: string | null;
} {
  return {
    ...project,
    created_at: toIsoDate(project.created_at),
    updated_at: toIsoDate(project.updated_at),
    last_edited_at: toIsoDate(project.last_edited_at),
  };
}

let _projectService: SubtitlerProjectService | null = null;

async function getProjectService(): Promise<SubtitlerProjectService> {
  if (!_projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    _projectService = getSubtitlerProjectService();
    await _projectService.ensureInitialized();
  }
  return _projectService;
}

async function getShareService(): Promise<SubtitlerShareService> {
  const service = getSubtitlerShareService();
  await service.ensureInitialized();
  return service;
}

/** Shared body for the POST + DELETE /cleanup/:uploadId variants. */
async function cleanupUpload(uploadId: string | undefined) {
  if (!uploadId) {
    return { status: 400 as const, body: { error: 'Upload-ID fehlt' } };
  }
  try {
    await redisClient.set(`cancel:${uploadId}`, 'true', { EX: 300 });
    void scheduleImmediateCleanup(uploadId, 'manual cleanup');
    return { status: 200 as const, body: { success: true } };
  } catch (e: unknown) {
    return { status: 500 as const, body: { error: toUserFacingMessage(e) } };
  }
}

const s = initServer();

export const subtitlerContractRouter = s.router(subtitlerContract, {
  // ── Processing: cleanup / export-token ────────────────────────────────────

  postCleanup: async (args) => cleanupUpload(args.params.uploadId),

  deleteCleanup: async (args) => cleanupUpload(args.params.uploadId),

  postExportToken: async (args) => {
    try {
      const { uploadId, subtitles, subtitlePreference, stylePreference, heightPreference } =
        args.body;
      const result = await generateDownloadToken({
        uploadId,
        subtitles,
        ...(subtitlePreference != null && { subtitlePreference }),
        ...(stylePreference != null && { stylePreference }),
        ...(heightPreference != null && { heightPreference }),
      });
      return { status: 200 as const, body: { success: true, ...result } };
    } catch (e: unknown) {
      return {
        status: 400 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  // ── Processing: transcription ─────────────────────────────────────────────

  postProcess: async (args) => {
    // Ohne Land nahm die Transkription die deutsche Wortliste (Jänner,
    // Nationalrat …) — der manuelle Weg der Mobile-App schickt keines mit.
    const result = await startTranscriptionJob(args.body, extractLocaleFromRequest(args.req));
    if (result.ok) {
      return {
        status: 202 as const,
        body: { success: true, status: 'processing' as const, uploadId: args.body.uploadId },
      };
    }
    return { status: result.code, body: { error: result.error } };
  },

  getResult: async (args) => {
    const { uploadId } = args.params;
    const subtitlePreference = args.query.subtitlePreference ?? 'manual';
    const stylePreference = args.query.stylePreference ?? 'standard';
    const heightPreference = args.query.heightPreference ?? 'tief';
    const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;
    try {
      const raw = (await redisClient.get(jobKey)) as string | null;
      if (!raw) {
        return { status: 404 as const, body: { status: 'not_found' as const } };
      }
      const job = parseRedisJobResult(raw, `result:${uploadId}`);
      if (!job) {
        return { status: 500 as const, body: { error: 'Job-Status konnte nicht gelesen werden' } };
      }
      const compression = await getCompressionStatus(uploadId);
      return {
        status: 200 as const,
        body: {
          status: job.status,
          subtitles: job.data,
          compression,
          ...(job.status === 'error' && typeof job.data === 'string' && { error: job.data }),
        },
      };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  getCompressionStatus: async (args) => {
    try {
      return { status: 200 as const, body: await getCompressionStatus(args.params.uploadId) };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  // ── Processing: manual export lifecycle ───────────────────────────────────

  postExport: async (args) => {
    // Mobile schickt beim Export kein Land; ohne Rückfall wurde jeder
    // österreichische Export im deutschen Untertitel-Stil gerendert.
    // SECURITY: the owner is the session user, never `body.userId` — the
    // export reads, overwrites and creates projects under that id. Shipped
    // mobile builds still send the field; the schema keeps it, we ignore it.
    const result = await startSubtitledVideoExport({
      ...args.body,
      userId: getUserId(args.req) ?? null,
      locale: args.body.locale ?? extractLocaleFromRequest(args.req),
    });
    if (result.ok) {
      return {
        status: 202 as const,
        body: { status: 'exporting' as const, exportToken: result.exportToken },
      };
    }
    return { status: result.code, body: { error: result.error } };
  },

  postExportSegments: async (args) => {
    const { uploadId, projectId, segments, includeSubtitles, subtitleConfig } = args.body;
    if (!uploadId && !projectId) {
      return { status: 400 as const, body: { error: 'Upload-ID oder Projekt-ID benötigt' } };
    }
    try {
      let videoPath: string;
      if (projectId) {
        // SECURITY: scope the project lookup to the authenticated owner. Using the
        // unscoped getProjectById here let any user export another user's video by
        // passing its project id (IDOR → cross-tenant read via the exportToken).
        const userId = getUserId(args.req);
        if (!userId) {
          return { status: 404 as const, body: { error: 'Projekt nicht gefunden' } };
        }
        const ps = await getProjectService();
        let proj: Awaited<ReturnType<typeof ps.getProject>> | null = null;
        try {
          proj = await ps.getProject(userId, projectId);
        } catch {
          return { status: 404 as const, body: { error: 'Projekt nicht gefunden' } };
        }
        if (!proj?.video_path) {
          return { status: 404 as const, body: { error: 'Projekt nicht gefunden' } };
        }
        const source = await ps.getVideoSource(userId, projectId);
        if (!source?.path) {
          return { status: 404 as const, body: { error: 'Video nicht gefunden' } };
        }
        videoPath = source.path;
      } else {
        videoPath = getFilePathFromUploadId(uploadId!);
      }
      if (!(await checkFileExists(videoPath))) {
        return { status: 404 as const, body: { error: 'Video nicht gefunden' } };
      }

      const svc = await import('../../services/subtitler/segmentExportService.js');
      const resolvedProjectId = projectId || uploadId;
      const result =
        includeSubtitles && subtitleConfig
          ? await svc.exportWithSegmentsAndSubtitles(videoPath, segments, subtitleConfig, {
              ...(resolvedProjectId != null && { projectId: resolvedProjectId }),
            })
          : await svc.exportWithSegments(videoPath, segments, {
              ...(resolvedProjectId != null && { projectId: resolvedProjectId }),
            });
      return {
        status: 202 as const,
        body: { exportToken: result.exportToken, segmentCount: result.segmentCount },
      };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  getExportProgress: async (args) => {
    const { exportToken } = args.params;
    try {
      const raw = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!raw) {
        return { status: 404 as const, body: { status: 'not_found' as const } };
      }
      const progress = parseExportProgress(raw, `export-progress:${exportToken}`);
      if (!progress) {
        return {
          status: 500 as const,
          body: { error: 'Export-Status konnte nicht gelesen werden' },
        };
      }
      return { status: 200 as const, body: progress };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  // ── Processing: auto pipeline ─────────────────────────────────────────────

  postProcessAuto: async (args) => {
    const { uploadId, maxResolution = null, appendUploadIds = [] } = args.body;
    const userId = getUserId(args.req) ?? null;
    // requireAuth runs on this prefix (see routes.ts), so req.user exists and
    // tryResolveUser has already overlaid req.user.locale with the fresh,
    // Redis-cached DB locale (services/localization/localeCache). That makes
    // extractLocaleFromRequest return the persisted profile value rather than
    // falling through to the browser-derived X-User-Locale header — the
    // fall-through that served AT users the German subtitle style.
    // `source` is logged because that fall-through was invisible for months.
    const locale = extractLocaleFromRequest(args.req);
    const source = (args.req as { user?: { locale?: string } }).user?.locale ? 'profile' : 'header';
    log.info(
      `[process-auto] uploadId=${uploadId} → locale=${locale} (${source}) userId=${userId ?? 'none'}`
    );
    try {
      const videoPath = getFilePathFromUploadId(uploadId);
      if (!(await checkFileExists(videoPath))) {
        return { status: 404 as const, body: { error: 'Video nicht gefunden' } };
      }
      let appendPaths: string[];
      try {
        appendPaths = appendUploadIds.map(getFilePathFromUploadId);
      } catch {
        // A malformed id is not an upload of ours.
        return { status: 404 as const, body: { error: 'Video nicht gefunden' } };
      }
      for (const path of appendPaths) {
        if (!(await checkFileExists(path))) {
          return { status: 404 as const, body: { error: 'Video nicht gefunden' } };
        }
      }
      const originalFilename = (await getOriginalFilename(uploadId)) || 'video.mp4';
      await startAutoProcessing({
        uploadId,
        videoPath,
        originalFilename,
        userId,
        locale,
        maxResolution,
        appendPaths,
      });
      return { status: 202 as const, body: { status: 'processing' as const } };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  postProcessFromParteitag: async (args) => {
    const { speechId, maxResolution = null } = args.body;
    try {
      const speech = await getSpeech(speechId);
      const convention = speech ? await getConventionById(speech.convention_id) : null;
      if (!speech || !convention) {
        return {
          status: 404 as const,
          body: { code: 'NOT_FOUND' as const, error: 'Rede nicht gefunden.' },
        };
      }
      const viewer = await viewerFromRequest(args.req);
      const access = checkSpeechAccess(
        viewer,
        convention,
        speech,
        await hasGrant(viewer.userId, convention.id)
      );
      if (access === 'not_found') {
        return {
          status: 404 as const,
          body: { code: 'NOT_FOUND' as const, error: 'Rede nicht gefunden.' },
        };
      }
      if (access === 'locked') {
        return {
          status: 403 as const,
          body: { code: 'LOCKED' as const, error: 'Parteitag ist gesperrt.' },
        };
      }

      // Stored word timings run no model. Without them the pipeline falls back to
      // external transcription, which needs the same Art.-9 consent as /process.
      if (speech.words.length === 0 && !sessionHasAiConsent(getAuthedUser(args.req))) {
        return {
          status: 403 as const,
          body: {
            code: AI_CONSENT_REQUIRED_CODE,
            error: 'AI consent required',
            message:
              'Für die KI-Funktionen fehlt Deine ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO.',
          },
        };
      }

      const media = await getMedia(speech.reel_media_id);
      if (!media) {
        return {
          status: 410 as const,
          body: { code: 'SOURCE_GONE' as const, error: 'Quelle nicht mehr verfügbar' },
        };
      }
      const storage = getSystemMediaStorage();
      const videoPath = storage.resolveLocalPath(media.storage_key);
      if (videoPath === null) {
        return {
          status: 501 as const,
          body: {
            code: 'STORAGE_REMOTE' as const,
            error: 'Der Systemspeicher liegt nicht lokal vor.',
          },
        };
      }
      if (!(await storage.stat(media.storage_key))) {
        return {
          status: 410 as const,
          body: { code: 'SOURCE_GONE' as const, error: 'Quelle nicht mehr verfügbar' },
        };
      }

      const uploadId = `parteitag-${speech.id}-${randomUUID().slice(0, 8)}`;
      await startAutoProcessing({
        uploadId,
        videoPath,
        originalFilename: `${downloadBaseName(convention, speech)}.mp4`,
        userId: viewer.userId,
        locale: extractLocaleFromRequest(args.req),
        maxResolution,
        precomputed: { fullText: speech.transcript, words: speech.words },
        sourceSystemMediaId: media.id,
      });
      return { status: 202 as const, body: { uploadId } };
    } catch (e: unknown) {
      log.error('[process-parteitag] failed', e);
      return {
        status: 500 as const,
        body: { code: 'INTERNAL' as const, error: toUserFacingMessage(e) },
      };
    }
  },

  getAutoProgress: async (args) => {
    const { uploadId } = args.params;
    try {
      const raw = (await redisClient.get(`auto:${uploadId}`)) as string | null;
      if (!raw) {
        return { status: 404 as const, body: { status: 'not_found' as const } };
      }
      const progress = parseAutoProgress(raw, `auto-progress:${uploadId}`);
      if (!progress) {
        return { status: 500 as const, body: { error: 'Auto-Status konnte nicht gelesen werden' } };
      }
      return { status: 200 as const, body: progress };
    } catch (e: unknown) {
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(e) },
      };
    }
  },

  // ── Social ─────────────────────────────────────────────────────────────────

  generateSocial: async (args) => {
    try {
      const locale = extractLocaleFromRequest(args.req);
      const systemPrompt = localizePlaceholders(
        'Du bist Social Media Manager für {{partyName}}. Erstelle einen Instagram Reel Beitragstext basierend auf den Untertiteln des Videos. Der Text soll die Kernbotschaft des Videos aufgreifen und in einen ansprechenden Social Media Post umwandeln.',
        locale
      );
      const userPrompt = localizePlaceholders(
        `Untertitel: ${args.body.subtitles}

Erstelle einen Instagram Reel Beitragstext, der:
1. Mit einem starken Hook beginnt
2. Die Kernbotschaft des Videos prägnant zusammenfasst
3. Maximal 2-3 relevante Hashtags verwendet
4. Mit einem Call-to-Action endet
5. Emojis passend aber sparsam einsetzt
6. Maximal 300 Zeichen lang ist
7. Den Stil und die Werte von {{partyName}} widerspiegelt`,
        locale
      );

      // `metadata` is no longer populated: the facade returns the text, and the
      // only consumer (useSocialTextGenerator) reads `content`. The response
      // field stays in the schema, where it is `nullish`.
      const content = await aiText({
        lane: 'subtitler_social',
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      return { status: 200 as const, body: { content } };
    } catch (error: unknown) {
      log.error('Social media text generation failed:', error);
      return {
        status: 500 as const,
        body: { error: 'Fehler bei der Erstellung des Social Media Texts' },
      };
    }
  },

  // ── Share management ───────────────────────────────────────────────────────

  createShare: async (args) => {
    const userId = getUserId(args.req);
    if (!userId) {
      return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
    }
    try {
      const { exportToken, title, projectId, expiresInDays = 7 } = args.body;

      const rawExportData = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!rawExportData) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Export nicht gefunden oder abgelaufen' },
        };
      }

      const exportData = parseExportProgress(rawExportData, `share-from-export:${exportToken}`);
      if (!exportData) {
        return {
          status: 500 as const,
          body: { success: false, error: 'Export-Daten konnten nicht gelesen werden' },
        };
      }
      if (exportData.status !== 'complete') {
        return {
          status: 400 as const,
          body: { success: false, error: 'Export noch nicht abgeschlossen' },
        };
      }
      if (!exportData.outputPath) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Export-Datei nicht gefunden' },
        };
      }
      try {
        await fsPromises.access(exportData.outputPath);
      } catch {
        return {
          status: 404 as const,
          body: { success: false, error: 'Export-Datei nicht gefunden' },
        };
      }

      const service = await getShareService();
      const share = await service.createShare(userId, {
        videoPath: exportData.outputPath,
        title: title || 'Untertiteltes Video',
        ...(exportData.duration != null && { duration: exportData.duration }),
        ...(projectId && { projectId }),
        expiresInDays: expiresInDays ?? 7,
      });

      log.info(`Share created: ${share.shareToken} by user ${userId}`);
      return {
        status: 200 as const,
        body: {
          success: true,
          share: {
            shareToken: share.shareToken,
            shareUrl: share.shareUrl,
            expiresAt: share.expiresAt,
          },
        },
      };
    } catch (error: unknown) {
      log.error('Failed to create share:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Share konnte nicht erstellt werden' },
      };
    }
  },

  createShareFromProject: async (args) => {
    const userId = getUserId(args.req);
    if (!userId) {
      return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
    }
    try {
      const { projectId, title, expiresInDays = 7 } = args.body;

      const projService = await getProjectService();
      let project;
      try {
        project = await projService.getProject(userId, projectId);
      } catch {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden oder keine Berechtigung' },
        };
      }

      if (!project?.video_path) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt-Video nicht gefunden' },
        };
      }

      let thumbnailPath: string | null = null;
      if (project.thumbnail_path) {
        const tempThumbnailPath = projService.getThumbnailPath(project.thumbnail_path);
        try {
          await fsPromises.access(tempThumbnailPath);
          thumbnailPath = tempThumbnailPath;
        } catch {
          thumbnailPath = null;
        }
      }

      const service = await getShareService();

      const startPendingRender = async (): Promise<{
        shareToken: string;
        shareUrl: string;
        expiresAt: string | Date;
      }> => {
        const videoDuration = project.video_metadata?.duration;
        const share = await service.createPendingShare(userId, {
          title: title || project.title || 'Untertiteltes Video',
          ...(thumbnailPath && { thumbnailPath }),
          ...(typeof videoDuration === 'number' && { duration: videoDuration }),
          projectId,
          expiresInDays: expiresInDays ?? 7,
        });
        void triggerBackgroundRender(userId, projectId, share.shareToken, project);
        return {
          shareToken: share.shareToken,
          shareUrl: share.shareUrl,
          expiresAt: share.expiresAt,
        };
      };

      // Needs rendering (no pre-rendered subtitled video yet).
      if (!project.subtitled_video_path) {
        if (!project.subtitles) {
          return {
            status: 400 as const,
            body: {
              success: false,
              error: 'Projekt hat keine Untertitel zum Exportieren.',
              code: 'NO_SUBTITLES',
            },
          };
        }
        const pending = await startPendingRender();
        return {
          status: 200 as const,
          body: { success: true, share: { ...pending, status: 'rendering' } },
        };
      }

      const videoPath = projService.getSubtitledVideoPath(project.subtitled_video_path);
      try {
        await fsPromises.access(videoPath);
      } catch {
        if (!project.subtitles) {
          return {
            status: 400 as const,
            body: {
              success: false,
              error: 'Video-Datei nicht gefunden und keine Untertitel zum Rendern.',
              code: 'NO_SUBTITLES',
            },
          };
        }
        const pending = await startPendingRender();
        return {
          status: 200 as const,
          body: { success: true, share: { ...pending, status: 'rendering' } },
        };
      }

      const videoDuration = project.video_metadata?.duration;
      const share = await service.createShare(userId, {
        videoPath,
        title: title || project.title || 'Untertiteltes Video',
        ...(thumbnailPath && { thumbnailPath }),
        ...(typeof videoDuration === 'number' && { duration: videoDuration }),
        projectId,
        expiresInDays: expiresInDays ?? 7,
      });
      return {
        status: 200 as const,
        body: {
          success: true,
          share: {
            shareToken: share.shareToken,
            shareUrl: share.shareUrl,
            expiresAt: share.expiresAt,
            status: 'ready',
          },
        },
      };
    } catch (error: unknown) {
      log.error('Failed to create share from project:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Share konnte nicht erstellt werden' },
      };
    }
  },

  listMyShares: async (args) => {
    const userId = getUserId(args.req);
    if (!userId) {
      return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
    }
    try {
      const service = await getShareService();
      const shares = await service.getUserShares(userId);
      return { status: 200 as const, body: { success: true, shares } };
    } catch (error: unknown) {
      log.error('Failed to get user shares:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Geteilte Videos konnten nicht geladen werden' },
      };
    }
  },

  getShare: async (args) => {
    const { shareToken } = args.params;
    try {
      const service = await getShareService();
      const share = await service.getShareByToken(shareToken);
      if (!share) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Geteiltes Video nicht gefunden' },
        };
      }
      if (share.expired) {
        return {
          status: 410 as const,
          body: { success: false, error: 'Link abgelaufen', expired: true as const },
        };
      }
      return {
        status: 200 as const,
        body: {
          success: true,
          share: {
            title: share.title,
            duration: share.duration,
            thumbnailUrl: share.thumbnail_path
              ? `/api/subtitler/share/${shareToken}/thumbnail`
              : null,
            expiresAt: share.expires_at,
            downloadCount: share.download_count,
            sharerName: share.sharer_name,
            status: share.status || 'ready',
          },
        },
      };
    } catch (error: unknown) {
      log.error('Failed to get share info:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Fehler beim Laden des geteilten Videos' },
      };
    }
  },

  deleteShare: async (args) => {
    const userId = getUserId(args.req);
    if (!userId) {
      return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
    }
    try {
      const { shareToken } = args.params;
      const service = await getShareService();
      await service.deleteShare(userId, shareToken);
      log.info(`Share deleted: ${shareToken} by user ${userId}`);
      return { status: 200 as const, body: { success: true, message: 'Geteiltes Video gelöscht' } };
    } catch (error: unknown) {
      log.error('Failed to delete share:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found') || errMsg.includes('not owned')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Geteiltes Video nicht gefunden oder keine Berechtigung' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Geteiltes Video konnte nicht gelöscht werden' },
      };
    }
  },

  // ── Projects ───────────────────────────────────────────────────────────────

  listProjects: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const service = await getProjectService();
      const projects = await service.getUserProjects(userId);
      return {
        status: 200 as const,
        body: {
          success: true,
          projects: projects.map((project) => ({
            ...toIsoProjectDates(project),
            thumbnail_url: buildReelThumbnailUrl(project),
          })),
        },
      };
    } catch (error: unknown) {
      log.error('[subtitlerContract.listProjects] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekte konnten nicht geladen werden' },
      };
    }
  },

  getProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      const project = await service.getProject(userId, projectId);
      return { status: 200 as const, body: { success: true, project: toIsoProjectDates(project) } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.getProject] Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht geladen werden' },
      };
    }
  },

  createProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      if (!args.body.uploadId) {
        return {
          status: 400 as const,
          body: { success: false, error: 'Upload-ID ist erforderlich' },
        };
      }
      const { project, isNew } = await saveOrUpdateProject(userId, args.body);
      const status = isNew ? (201 as const) : (200 as const);
      return { status, body: { success: true, project: toIsoProjectDates(project), isNew } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.createProject] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error:
            (error instanceof Error ? error.message : String(error)) ||
            'Projekt konnte nicht erstellt werden',
        },
      };
    }
  },

  updateProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      const project = await service.updateProject(userId, projectId, args.body);
      return { status: 200 as const, body: { success: true, project: toIsoProjectDates(project) } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.updateProject] Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('not found') || errMsg.includes('access denied')) {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht aktualisiert werden' },
      };
    }
  },

  deleteProject: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      if ((await service.trashProject(userId, projectId)) !== 'ok') {
        return {
          status: 404 as const,
          body: { success: false, error: 'Projekt nicht gefunden' },
        };
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.deleteProject] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht gelöscht werden' },
      };
    }
  },

  postEditorSeed: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { buildEditorSeed } = await import('../../services/subtitler/editorSeed.js');
      const result = await buildEditorSeed(
        await getProjectService(),
        userId,
        args.params.projectId,
        extractLocaleFromRequest(args.req)
      );
      if (result.status === 'not_found') {
        return { status: 404 as const, body: { success: false, error: 'Projekt nicht gefunden' } };
      }
      if (result.status === 'source_gone') {
        return {
          status: 410 as const,
          body: { success: false, error: 'Das Originalvideo ist nicht mehr verfügbar' },
        };
      }
      return { status: 200 as const, body: result.seed };
    } catch (error: unknown) {
      log.error('[subtitlerContract.postEditorSeed] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Projekt konnte nicht für den Editor vorbereitet werden' },
      };
    }
  },

  trackExport: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }
      const { projectId } = args.params;
      const service = await getProjectService();
      await service.incrementExportCount(userId, projectId);
      return { status: 200 as const, body: { success: true } };
    } catch (error: unknown) {
      log.error('[subtitlerContract.trackExport] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Export konnte nicht getrackt werden' },
      };
    }
  },
});

/**
 * Mount the ts-rest subtitler contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy binary routers.
 */
export function mountSubtitlerContractRouter(app: Application): void {
  createExpressEndpoints(subtitlerContract, subtitlerContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'subtitlerContract'),
  });
}
