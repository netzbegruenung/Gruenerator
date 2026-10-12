/**
 * Voice Controller
 * Transcription routes: push-to-talk (/transcribe) and TUS uploads
 * (/transcribe-upload/stream).
 *
 * STT: Mistral Voxtral (also used for streaming & real-time), GreenPT as failover
 * via services/transcription/providerPolicy.
 */

import fs from 'fs';

import { MAX_AUDIO_BYTES, MAX_AUDIO_MB, MAX_AUDIO_MINUTES } from '@gruenerator/contracts';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getUploadStatus,
} from '../../services/subtitler/tusService.js';
import mistralVoiceService from '../../services/voice/mistralVoiceService.js';
import { identifySpeakers } from '../../services/voice/protokollService.js';
import {
  audioTooLargeMessage,
  describeTranscriptionFailure,
  type TranscriptionPhase,
} from '../../services/voice/transcriptionErrors.js';
import {
  extractAudioFromVideoPath,
  isVideoFile,
  mayExceedChunkLimit,
  probeBufferDurationSeconds,
  transcribeBuffer,
  type TranscriptionOptions,
} from '../../services/voice/transcriptionRouterService.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename } from '../../utils/validation/security.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';

const log = createLogger('voice');

/** Well under the 300s proxy_read_timeout on /api/ in the Grünerator nginx. */
const TRANSCRIBE_HEARTBEAT_MS = 20_000;

const UPLOAD_GONE_MESSAGE =
  'Die hochgeladene Datei ist nicht mehr auf dem Server, vermutlich weil der Upload zu lange zurückliegt. Bitte lade sie erneut hoch.';

// ============================================================================
// Types
// ============================================================================

interface TranscribeResponse {
  success: boolean;
  text?: string;
  error?: string;
}

const tusTranscribeBodySchema = z.object({
  uploadId: z.string().min(1),
  language: z.string().optional(),
  diarize: z.boolean().optional(),
  timestamps: z.boolean().optional(),
  eco: z.boolean().optional(),
});
type TusTranscribeBody = z.infer<typeof tusTranscribeBodySchema>;

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

/**
 * The only caller is the voice agent's push-to-talk (packages/voice useSTT):
 * one short 16-bit mono WAV, ~5.8 MB per minute at 48 kHz. The cap allows
 * about four minutes and keeps an in-memory upload from holding hundreds of
 * MB per request; long recordings go through the TUS upload instead.
 */
const MAX_PUSH_TO_TALK_BYTES = 25 * 1024 * 1024;

const upload = multer({
  defParamCharset: 'utf8',
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PUSH_TO_TALK_BYTES },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    cb(null, mistralVoiceService.isFormatSupported(file.mimetype));
  },
});

function receiveAudio(req: Request, res: Response<TranscribeResponse>, next: NextFunction): void {
  upload.single('audio')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: 'Die Aufnahme ist zu lang. Halte die Taste höchstens etwa vier Minuten gedrückt.',
      });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/voice/transcribe
 * Transcribe one push-to-talk recording — Voxtral first, GreenPT as failover
 */
router.post('/transcribe', receiveAudio, (async (
  req: Request,
  res: Response<TranscribeResponse>
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'Keine Aufnahme erhalten oder Audioformat nicht unterstützt.',
    });
    return;
  }

  try {
    const result = await transcribeBuffer(req.file.buffer, req.file.originalname, {
      language: 'de',
      locale: extractLocaleFromRequest(req),
    });
    res.json({ success: true, text: result.text });
  } catch (error) {
    log.error('[Voice] Transcription error:', error);
    res.status(500).json({
      success: false,
      error: describeTranscriptionFailure('transcription', error),
    });
  }
}) as express.RequestHandler);

// ============================================================================
// TUS-based transcription (two-phase: upload via TUS, then process)
// ============================================================================

/**
 * POST /api/voice/transcribe-upload/stream
 * Streaming variant of TUS-based transcription. Returns SSE events.
 */
router.post(
  '/transcribe-upload/stream',
  validateBody(tusTranscribeBodySchema),
  async (req: TypedRequest<TusTranscribeBody>, res: Response) => {
    const {
      uploadId,
      language = 'de',
      diarize = false,
      timestamps = false,
      eco = false,
    } = req.body;
    const locale = extractLocaleFromRequest(req);

    const filePath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(filePath))) {
      void scheduleImmediateCleanup(uploadId, 'file not found');
      return res.status(404).json({
        success: false,
        error: UPLOAD_GONE_MESSAGE,
      });
    }

    const sse = createSSEStream(res);
    // Long phases (extraction, a 120-min Voxtral call, speaker naming) emit
    // nothing for minutes; nginx drops an /api/ response after 300s of
    // silence, which the client could only report as "Verbindung abgebrochen".
    const heartbeat = setInterval(() => {
      sse.sendRaw('heartbeat', { type: 'heartbeat' });
    }, TRANSCRIBE_HEARTBEAT_MS);
    let phase: TranscriptionPhase = 'read';

    try {
      markUploadAsProcessed(uploadId);
      const uploadStatus = await getUploadStatus(uploadId);
      const meta = uploadStatus.metadata?.metadata as Record<string, string> | undefined;
      let filename = sanitizeFilename(meta?.filename || 'audio.mp3', 'audio.mp3');
      const filetype = meta?.filetype || '';
      // The direct Voxtral stream below bypasses the provider policy, so Öko-Modus
      // must take the policy path even without timestamps.
      const needsFullTranscription = diarize || timestamps || eco;

      let audioBuffer: Buffer;
      let knownDurationSeconds: number | null = null;
      if (isVideoFile(filetype)) {
        log.debug('[Voice] TUS upload is video, extracting audio from:', filename);
        phase = 'extraction';
        sse.sendRaw('extraction_start', { type: 'extraction_start' });
        const extracted = await extractAudioFromVideoPath(filePath, filename, {
          onProgress: (percent, timemark) => {
            sse.sendRaw('extraction_progress', { type: 'extraction_progress', percent, timemark });
          },
        });
        audioBuffer = extracted.buffer;
        filename = extracted.filename;
        knownDurationSeconds = extracted.durationSeconds;
        const audioSizeMB = +(audioBuffer.length / 1024 / 1024).toFixed(1);
        sse.sendRaw('extraction_complete', { type: 'extraction_complete', audioSizeMB });
      } else {
        // /api/audio/upload's TUS ceiling is MAX_VIDEO_UPLOAD_BYTES (3GB) for the
        // whole path, video and audio alike — video never buffers fully (see
        // extractAudioFromVideoPath above), but a non-video upload lands here and
        // would otherwise buffer the entire file. Gate it at the audio-specific
        // ceiling instead of trusting client-supplied `filetype`.
        const uploadSize = uploadStatus.metadata?.size ?? 0;
        if (uploadSize > MAX_AUDIO_BYTES) {
          void scheduleImmediateCleanup(uploadId, 'audio upload exceeds MAX_AUDIO_BYTES');
          sse.sendRaw('error', { type: 'error', text: audioTooLargeMessage(MAX_AUDIO_MB) });
          return;
        }
        audioBuffer = Buffer.from(await fs.promises.readFile(filePath));
      }

      log.debug('[Voice] Starting TUS streaming transcription for:', filename);
      phase = 'transcription';
      sse.sendRaw('transcription_start', { type: 'transcription_start' });

      if (needsFullTranscription) {
        const options: TranscriptionOptions = {
          language,
          ...(timestamps && { timestamp_granularities: ['segment'] as const }),
          ...(diarize && { diarize: true }),
          ...(eco && { eco: true }),
          locale,
        };

        const result = await transcribeBuffer(audioBuffer, filename, options, knownDurationSeconds);

        // Naming speakers is a nicety on top of a finished transcript: losing
        // it must not throw away minutes of transcription.
        let speakerMap: Record<string, string> = {};
        if (diarize && result.text.includes('[speaker_')) {
          try {
            speakerMap = await identifySpeakers(result.text);
          } catch (error) {
            log.warn('[Voice] speaker identification failed, returning unnamed speakers:', error);
          }
        }

        sse.sendRaw('done', {
          type: 'done',
          text: result.text,
          segments: result.segments,
          hasTimestamps: result.hasTimestamps,
          speakerMap,
        });
      } else {
        // The streaming API has no chunking and shares the per-call duration
        // ceiling, so anything longer falls back to the chunked non-streaming
        // path instead of dying inside the provider SDK mid-stream.
        const duration =
          knownDurationSeconds ??
          (mayExceedChunkLimit(audioBuffer)
            ? await probeBufferDurationSeconds(audioBuffer, filename)
            : null);
        if (duration != null && duration > MAX_AUDIO_MINUTES * 60) {
          const result = await transcribeBuffer(
            audioBuffer,
            filename,
            { language, locale },
            duration
          );
          sse.sendRaw('done', {
            type: 'done',
            text: result.text,
            segments: result.segments,
            hasTimestamps: result.hasTimestamps,
            speakerMap: {},
          });
        } else {
          for await (const event of mistralVoiceService.transcribeFromBufferStream(
            audioBuffer,
            filename,
            { language, locale }
          )) {
            sse.sendRaw(event.type, event);
          }
        }
      }

      void scheduleImmediateCleanup(uploadId, 'transcription complete');
    } catch (error) {
      log.error(`[Voice] TUS streaming transcription error (phase=${phase}):`, error);
      void scheduleImmediateCleanup(uploadId, 'transcription error');
      sse.sendRaw('error', { type: 'error', text: describeTranscriptionFailure(phase, error) });
    } finally {
      clearInterval(heartbeat);
      sse.end();
    }
  }
);

export default router;
