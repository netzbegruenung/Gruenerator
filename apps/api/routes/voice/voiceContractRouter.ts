/**
 * ts-rest contract router for voice endpoints.
 *
 * Covers:
 *   POST /api/voice/transcribe-upload (deprecated, see the handler)
 *   POST /api/voice/protokoll
 *   POST /api/voice/todo-list
 *
 * Mount BEFORE the legacy voiceController router in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the
 * legacy router (which handles multer/multipart routes).
 *
 * requireAuth + the rate limiter are applied on the /api/voice prefix in
 * routes.ts, before this router is mounted — createExpressEndpoints registers
 * handlers straight on the app, so prefix middleware added afterwards would
 * not cover them.
 */

import fs from 'fs';

import { voiceContract, MAX_AUDIO_BYTES, MAX_AUDIO_MB } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getUploadStatus,
} from '../../services/subtitler/tusService.js';
import {
  generateProtokoll,
  identifySpeakers,
  extractTodoList,
} from '../../services/voice/protokollService.js';
import {
  extractAudioFromVideoPath,
  isVideoFile,
  transcribeBuffer,
  type TranscriptionOptions,
} from '../../services/voice/transcriptionRouterService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename } from '../../utils/validation/security.js';

import type { Application } from 'express';

const log = createLogger('voiceContractRouter');

const s = initServer();

export const voiceContractRouter = s.router(voiceContract, {
  /**
   * Deprecated 2026-10-12, remove after 2026-11-12. The web client moved to
   * /transcribe-upload/stream; this stays only for desktop builds that have
   * not auto-updated yet. It sends nothing until it is done, so nginx cuts
   * long recordings off after 300s.
   */
  transcribeUpload: async (args) => {
    const { uploadId, language = 'de', diarize = false, timestamps = false } = args.body;

    const filePath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(filePath))) {
      void scheduleImmediateCleanup(uploadId, 'file not found');
      return { status: 404 as const, body: { success: false, error: 'Upload nicht gefunden' } };
    }

    try {
      markUploadAsProcessed(uploadId);
      const uploadStatus = await getUploadStatus(uploadId);
      const meta = uploadStatus.metadata?.metadata as Record<string, string> | undefined;
      let filename = sanitizeFilename(meta?.filename || 'audio.mp3', 'audio.mp3');
      const filetype = meta?.filetype || '';

      const options: TranscriptionOptions = {
        language: language ?? 'de',
        ...(timestamps && { timestamp_granularities: ['segment'] as const }),
        ...(diarize && { diarize: true }),
        locale: extractLocaleFromRequest(args.req),
      };

      let audioBuffer: Buffer;
      let knownDurationSeconds: number | null = null;
      if (isVideoFile(filetype)) {
        const extracted = await extractAudioFromVideoPath(filePath, filename);
        audioBuffer = extracted.buffer;
        filename = extracted.filename;
        knownDurationSeconds = extracted.durationSeconds;
      } else {
        // /api/audio/upload's TUS ceiling is MAX_VIDEO_UPLOAD_BYTES (3GB) for the
        // whole path, video and audio alike — video never buffers fully (see
        // extractAudioFromVideoPath above), but a non-video upload lands here and
        // would otherwise buffer the entire file. Gate it at the audio-specific
        // ceiling instead of trusting client-supplied `filetype`.
        const uploadSize = uploadStatus.metadata?.size ?? 0;
        if (uploadSize > MAX_AUDIO_BYTES) {
          void scheduleImmediateCleanup(uploadId, 'audio upload exceeds MAX_AUDIO_BYTES');
          return {
            status: 400 as const,
            body: {
              success: false,
              error: `Datei ist zu groß. Maximal ${MAX_AUDIO_MB}MB für Audio-Uploads.`,
            },
          };
        }
        audioBuffer = Buffer.from(await fs.promises.readFile(filePath));
      }

      const result = await transcribeBuffer(audioBuffer, filename, options, knownDurationSeconds);

      let speakerMap: Record<string, string> = {};
      if (diarize && result.text.includes('[speaker_')) {
        speakerMap = await identifySpeakers(result.text);
      }

      void scheduleImmediateCleanup(uploadId, 'transcription complete');

      return {
        status: 200 as const,
        body: {
          success: true,
          text: result.text,
          ...(result.segments != null && { segments: result.segments }),
          hasTimestamps: result.hasTimestamps,
          speakerMap,
          language: language ?? 'de',
        },
      };
    } catch (error) {
      log.error('[voiceContract.transcribeUpload] Error:', error);
      void scheduleImmediateCleanup(uploadId, 'transcription error');
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Transkription: ' + (error as Error).message,
        },
      };
    }
  },

  protokoll: async (args) => {
    const { inputText, protokollTyp } = args.body;

    try {
      const content = await generateProtokoll({
        inputText,
        protokollTyp: protokollTyp ?? 'Sitzungsprotokoll',
      });
      return { status: 200 as const, body: { success: true, content } };
    } catch (error) {
      log.error('[voiceContract.protokoll] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Protokoll-Erstellung: ' + (error as Error).message,
        },
      };
    }
  },

  todoList: async (args) => {
    const { text, title } = args.body;

    try {
      const todo = await extractTodoList(text, title ?? undefined);
      return {
        status: 200 as const,
        body: {
          success: true,
          content: todo.content,
          truncated: todo.truncated,
          coveredChars: todo.coveredChars,
          totalChars: todo.totalChars,
        },
      };
    } catch (error) {
      log.error('[voiceContract.todoList] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Aufgaben-Extraktion: ' + (error as Error).message,
        },
      };
    }
  },
});

/**
 * Mount the ts-rest voice contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy voiceController router.
 */
export function mountVoiceContractRouter(app: Application): void {
  createExpressEndpoints(voiceContract, voiceContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'voiceContract'),
  });
}
