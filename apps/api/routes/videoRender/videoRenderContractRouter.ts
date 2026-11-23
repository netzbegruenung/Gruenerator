/**
 * ts-rest contract router for the server render lane (`/api/video-render`).
 * Auth sits on the prefix in routes.ts. The file endpoint pipes the MP4 from
 * the render service (same binary-body trick as routes/exports).
 */
import { Readable } from 'node:stream';

import { videoRenderContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  VideoRenderBusyError,
  VideoRenderNotFoundError,
  VideoRenderNotReadyError,
  VIDEO_RENDER_UNAVAILABLE,
  VideoRenderUnavailableError,
  getRenderStatus,
  isVideoRenderAvailable,
  openRenderFile,
  startRender,
} from '../../services/videoRender/videoRenderService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

const log = createLogger('videoRenderContractRouter');

const INTERNAL = { message: 'Der Export ist fehlgeschlagen.' };
const NOT_FOUND = { message: 'Export nicht gefunden.' };
const NOT_READY = { message: 'Der Export ist noch nicht fertig.' };
const BUSY = { message: 'Es laufen bereits mehrere Exporte. Bitte warte, bis einer fertig ist.' };

const s = initServer();

export const videoRenderContractRouter = s.router(videoRenderContract, {
  availability: async () => ({
    status: 200 as const,
    body: { available: isVideoRenderAvailable() },
  }),
  start: async (args) => {
    try {
      const jobId = await startRender(getAuthedUser(args.req).id, args.body);
      return { status: 202 as const, body: { jobId } };
    } catch (error) {
      if (error instanceof VideoRenderBusyError) return { status: 429 as const, body: BUSY };
      if (error instanceof VideoRenderUnavailableError) {
        return { status: 503 as const, body: { message: VIDEO_RENDER_UNAVAILABLE } };
      }
      log.error('[videoRender.start] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  status: async (args) => {
    try {
      const body = await getRenderStatus(getAuthedUser(args.req).id, args.params.id);
      return { status: 200 as const, body };
    } catch (error) {
      if (error instanceof VideoRenderNotFoundError)
        return { status: 404 as const, body: NOT_FOUND };
      if (error instanceof VideoRenderUnavailableError) {
        return { status: 503 as const, body: { message: VIDEO_RENDER_UNAVAILABLE } };
      }
      log.error('[videoRender.status] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  file: async (args) => {
    try {
      const upstream = await openRenderFile(getAuthedUser(args.req).id, args.params.id);
      args.res.setHeader('Content-Type', 'video/mp4');
      args.res.setHeader('Content-Disposition', 'attachment; filename="gruenerator-video.mp4"');
      const length = upstream.headers.get('content-length');
      if (length) args.res.setHeader('Content-Length', length);
      return {
        status: 200 as const,
        body: Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>),
      };
    } catch (error) {
      if (error instanceof VideoRenderNotFoundError)
        return { status: 404 as const, body: NOT_FOUND };
      if (error instanceof VideoRenderNotReadyError)
        return { status: 409 as const, body: NOT_READY };
      if (error instanceof VideoRenderUnavailableError) {
        return { status: 503 as const, body: { message: VIDEO_RENDER_UNAVAILABLE } };
      }
      log.error('[videoRender.file] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },
});

export function mountVideoRenderContractRouter(app: Application): void {
  createExpressEndpoints(videoRenderContract, videoRenderContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'videoRenderContract'),
  });
}
