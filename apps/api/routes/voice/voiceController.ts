/**
 * Voice Controller
 * Handles audio transcription and chat.
 *
 * STT provider priority:
 *   1. Regolo faster-whisper-large-v3 (EU-hosted, preferred)
 *   2. Mistral Voxtral (fallback, also used for streaming & real-time)
 */

import fs from 'fs';

import express, { type Request, type Response, type Router } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
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
  extractAudioFromVideo,
  extractAudioFromVideoPath,
  isVideoFile,
  transcribeBuffer,
  type TranscriptionOptions,
  type TranscriptionSegment,
} from '../../services/voice/transcriptionRouterService.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename } from '../../utils/validation/security.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';

const log = createLogger('voice');

// ============================================================================
// Types
// ============================================================================

interface TranscribeRequest extends Request {
  file?: Express.Multer.File;
  body: {
    language?: string;
    removeTimestamps?: boolean;
    timestamps?: boolean;
    diarize?: boolean;
    contextBias?: string[];
  };
  query: {
    language?: string;
    removeTimestamps?: string;
    timestamps?: string;
    diarize?: string;
  };
}

interface ChatRequest extends Request {
  file?: Express.Multer.File;
  body: {
    prompt?: string;
  };
  query: {
    prompt?: string;
  };
}

interface TranscribeResponse {
  success: boolean;
  text?: string;
  segments?: TranscriptionSegment[];
  hasTimestamps?: boolean;
  speakerMap?: Record<string, string>;
  language?: string;
  error?: string;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  prompt?: string;
  error?: string;
}

const tusTranscribeBodySchema = z.object({
  uploadId: z.string().min(1),
  language: z.string().optional(),
  diarize: z.boolean().optional(),
  timestamps: z.boolean().optional(),
});
type TusTranscribeBody = z.infer<typeof tusTranscribeBodySchema>;

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

// Multer configuration for in-memory upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for video files
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (mistralVoiceService.isFormatSupported(file.mimetype) || isVideoFile(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported format: ${file.mimetype}. Supported: audio (${mistralVoiceService.getSupportedFormats().join(', ')}), video (mp4, mov, avi, mkv, webm)`
        )
      );
    }
  },
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/voice/transcribe
 * Transcribe audio file — prefers Regolo Whisper, falls back to Voxtral
 */
router.post(
  '/transcribe',
  upload.single('audio') as express.RequestHandler,
  (async (req: TranscribeRequest, res: Response<TranscribeResponse>): Promise<void> => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Keine Audio-Datei erhalten',
      });
      return;
    }

    let audioBuffer = req.file.buffer;
    let filename = req.file.originalname;

    const options: TranscriptionOptions = {
      language: req.query.language || req.body.language || 'de',
      removeTimestamps: req.query.removeTimestamps === 'true' || req.body.removeTimestamps === true,
      ...(req.query.timestamps === 'true' || req.body.timestamps === true
        ? { timestamp_granularities: ['segment'] as const }
        : {}),
      diarize: req.query.diarize === 'true' || req.body.diarize === true,
      ...(req.body.contextBias != null && { contextBias: req.body.contextBias }),
    };

    try {
      if (isVideoFile(req.file.mimetype)) {
        log.debug('[Voice] Video detected, extracting audio from:', filename);
        const extracted = await extractAudioFromVideo(req.file.buffer, filename);
        audioBuffer = extracted.buffer;
        filename = extracted.filename;
        log.debug(
          '[Voice] Audio extracted:',
          filename,
          `(${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB)`
        );
      }

      log.debug('[Voice] Starting transcription for:', filename, 'Options:', options);

      const result = await transcribeBuffer(audioBuffer, filename, options);

      let speakerMap: Record<string, string> = {};
      if (options.diarize && result.text.includes('[speaker_')) {
        speakerMap = await identifySpeakers(result.text);
      }

      res.json({
        success: true,
        text: result.text,
        ...(result.segments != null && { segments: result.segments }),
        hasTimestamps: result.hasTimestamps,
        speakerMap,
        ...(options.language != null && { language: options.language }),
      });
    } catch (error) {
      log.error('[Voice] Transcription error:', error);

      res.status(500).json({
        success: false,
        error: 'Fehler bei der Transkription: ' + (error as Error).message,
      });
    }
  }) as express.RequestHandler
);

/**
 * POST /api/voice/transcribe/stream
 * Streaming transcription — returns SSE events as text is transcribed.
 * For video files, also emits extraction_progress/extraction_complete events.
 * Supports diarize/timestamps — when enabled, uses non-streaming transcription
 * but still wraps in SSE for consistent progress feedback.
 */
router.post('/transcribe/stream', upload.single('audio'), (async (
  req: TranscribeRequest,
  res: Response
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten',
    });
    return;
  }

  let audioBuffer = req.file.buffer;
  let filename = req.file.originalname;
  const language = req.query.language || req.body.language || 'de';
  const diarize = req.query.diarize === 'true' || req.body.diarize === true;
  const timestamps = req.query.timestamps === 'true' || req.body.timestamps === true;
  const needsFullTranscription = diarize || timestamps;

  log.debug('[Voice] /transcribe/stream params:', {
    language,
    diarize,
    timestamps,
    needsFullTranscription,
    query: req.query,
  });

  const sse = createSSEStream(res);

  try {
    if (isVideoFile(req.file.mimetype)) {
      log.debug('[Voice] Video detected, extracting audio from:', filename);
      sse.sendRaw('extraction_start', { type: 'extraction_start' });

      const extracted = await extractAudioFromVideo(req.file.buffer, filename, {
        onProgress: (percent, timemark) => {
          sse.sendRaw('extraction_progress', { type: 'extraction_progress', percent, timemark });
        },
      });
      audioBuffer = extracted.buffer;
      filename = extracted.filename;

      const audioSizeMB = +(audioBuffer.length / 1024 / 1024).toFixed(1);
      log.debug('[Voice] Audio extracted:', filename, `(${audioSizeMB} MB)`);
      sse.sendRaw('extraction_complete', { type: 'extraction_complete', audioSizeMB });
    }

    log.debug('[Voice] Starting transcription for:', filename, { diarize, timestamps });
    sse.sendRaw('transcription_start', { type: 'transcription_start' });

    if (needsFullTranscription) {
      const options: TranscriptionOptions = {
        language,
        ...(timestamps && { timestamp_granularities: ['segment'] as const }),
        ...(diarize && { diarize: true }),
      };

      const result = await transcribeBuffer(audioBuffer, filename, options);

      let speakerMap: Record<string, string> = {};
      if (diarize && result.text.includes('[speaker_')) {
        log.debug('[Voice] Identifying speakers...');
        speakerMap = await identifySpeakers(result.text);
        log.debug('[Voice] Speaker map:', speakerMap);
      }

      sse.sendRaw('done', {
        type: 'done',
        text: result.text,
        segments: result.segments,
        hasTimestamps: result.hasTimestamps,
        speakerMap,
      });
    } else {
      // Streaming transcription — Voxtral only (Whisper has no streaming API)

      for await (const event of mistralVoiceService.transcribeFromBufferStream(
        audioBuffer,
        filename,
        { language }
      )) {
        sse.sendRaw(event.type, event);
      }
    }
  } catch (error) {
    log.error('[Voice] Streaming transcription error:', error);
    sse.sendRaw('error', { type: 'error', text: (error as Error).message });
  }

  sse.end();
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
    const { uploadId, language = 'de', diarize = false, timestamps = false } = req.body;

    const filePath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(filePath))) {
      void scheduleImmediateCleanup(uploadId, 'file not found');
      return res.status(404).json({ success: false, error: 'Upload nicht gefunden' });
    }

    const sse = createSSEStream(res);

    try {
      markUploadAsProcessed(uploadId);
      const uploadStatus = await getUploadStatus(uploadId);
      const meta = uploadStatus.metadata?.metadata as Record<string, string> | undefined;
      let filename = sanitizeFilename(meta?.filename || 'audio.mp3', 'audio.mp3');
      const filetype = meta?.filetype || '';
      const needsFullTranscription = diarize || timestamps;

      let audioBuffer: Buffer;
      if (isVideoFile(filetype)) {
        log.debug('[Voice] TUS upload is video, extracting audio from:', filename);
        sse.sendRaw('extraction_start', { type: 'extraction_start' });
        const extracted = await extractAudioFromVideoPath(filePath, filename, {
          onProgress: (percent, timemark) => {
            sse.sendRaw('extraction_progress', { type: 'extraction_progress', percent, timemark });
          },
        });
        audioBuffer = extracted.buffer;
        filename = extracted.filename;
        const audioSizeMB = +(audioBuffer.length / 1024 / 1024).toFixed(1);
        sse.sendRaw('extraction_complete', { type: 'extraction_complete', audioSizeMB });
      } else {
        audioBuffer = Buffer.from(await fs.promises.readFile(filePath));
      }

      log.debug('[Voice] Starting TUS streaming transcription for:', filename);
      sse.sendRaw('transcription_start', { type: 'transcription_start' });

      if (needsFullTranscription) {
        const options: TranscriptionOptions = {
          language,
          ...(timestamps && { timestamp_granularities: ['segment'] as const }),
          ...(diarize && { diarize: true }),
        };

        const result = await transcribeBuffer(audioBuffer, filename, options);

        let speakerMap: Record<string, string> = {};
        if (diarize && result.text.includes('[speaker_')) {
          speakerMap = await identifySpeakers(result.text);
        }

        sse.sendRaw('done', {
          type: 'done',
          text: result.text,
          segments: result.segments,
          hasTimestamps: result.hasTimestamps,
          speakerMap,
        });
      } else {
        for await (const event of mistralVoiceService.transcribeFromBufferStream(
          audioBuffer,
          filename,
          { language }
        )) {
          sse.sendRaw(event.type, event);
        }
      }

      void scheduleImmediateCleanup(uploadId, 'transcription complete');
    } catch (error) {
      log.error('[Voice] TUS streaming transcription error:', error);
      void scheduleImmediateCleanup(uploadId, 'transcription error');
      sse.sendRaw('error', { type: 'error', text: (error as Error).message });
    }

    sse.end();
  }
);

/**
 * POST /api/voice/chat
 * Chat with audio input
 */
router.post('/chat', upload.single('audio'), (async (
  req: ChatRequest,
  res: Response<ChatResponse>
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten',
    });
    return;
  }

  const audioBuffer = req.file.buffer;
  const filename = req.file.originalname;
  const prompt = req.body.prompt || req.query.prompt || 'Was ist in dieser Audio-Datei?';

  try {
    log.debug('[Voice] Starting audio chat for:', filename, 'Prompt:', prompt);

    const response: string = await mistralVoiceService.chatWithAudio(audioBuffer, filename, prompt);

    res.json({
      success: true,
      response,
      prompt,
    });
  } catch (error) {
    log.error('[Voice] Audio chat error:', error);

    res.status(500).json({
      success: false,
      error: 'Fehler beim Audio-Chat: ' + (error as Error).message,
    });
  }
}) as express.RequestHandler);

export default router;
