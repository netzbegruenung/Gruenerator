/**
 * Voice Controller
 * Handles audio transcription and chat.
 *
 * STT provider priority:
 *   1. Regolo faster-whisper-large-v3 (EU-hosted, preferred)
 *   2. Mistral Voxtral (fallback, also used for streaming & real-time)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import express, { type Request, type Response, type Router } from 'express';
import multer, { type FileFilterCallback } from 'multer';

import { extractAudio, cleanupFiles } from '../../services/subtitler/videoUploadService.js';
import mistralVoiceService from '../../services/voice/mistralVoiceService.js';
import {
  generateProtokoll,
  identifySpeakers,
  extractTodoList,
} from '../../services/voice/protokollService.js';
import { createLogger } from '../../utils/logger.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';

const log = createLogger('voice');

// ============================================================================
// Types
// ============================================================================

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  text: string;
  segments?: TranscriptionSegment[];
  hasTimestamps: boolean;
}

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

interface TranscribeUrlRequest extends Request {
  body: {
    url: string;
    language?: string;
    removeTimestamps?: boolean;
    timestamps?: boolean;
    diarize?: boolean;
    contextBias?: string[];
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

interface TranscribeUrlResponse extends TranscribeResponse {
  sourceUrl?: string;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  prompt?: string;
  error?: string;
}

interface FormatsResponse {
  success: boolean;
  supportedFormats?: string[];
  maxFileSize?: string;
  maxDuration?: string;
  provider?: string;
  error?: string;
}

type TimestampGranularity = 'segment';

interface TranscriptionOptions {
  language?: string;
  removeTimestamps?: boolean;
  timestamp_granularities?: TimestampGranularity[];
  diarize?: boolean;
  contextBias?: string[];
}

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
]);

function isVideoFile(mimetype: string): boolean {
  return VIDEO_MIME_TYPES.has(mimetype) || mimetype.startsWith('video/');
}

interface ExtractOptions {
  onProgress?: (percent: number, timemark: string) => void;
}

async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalname: string,
  options?: ExtractOptions
): Promise<{ buffer: Buffer; filename: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-video-'));
  const ext = path.extname(originalname) || '.mp4';
  const videoPath = path.join(tmpDir, `input${ext}`);
  const audioPath = path.join(tmpDir, 'extracted.mp3');

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    await extractAudio(videoPath, audioPath, { onProgress: options?.onProgress });
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename };
  } finally {
    await cleanupFiles(videoPath, audioPath);
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

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
// STT Provider Selection
// ============================================================================

const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
const WHISPER_MODEL = 'faster-whisper-large-v3';

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
}

function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/m4a',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
  };
  return mimeMap[ext || ''] || 'audio/wav';
}

/**
 * Transcribe audio buffer via Regolo faster-whisper (same endpoint as subtitler).
 * Returns the same shape as mistralVoiceService.transcribeFromBuffer().
 */
async function transcribeWithRegoloWhisper(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const apiKey = process.env.REGOLO_API_KEY;
  if (!apiKey) throw new Error('REGOLO_API_KEY is not configured');

  const { language = 'de', timestamp_granularities } = options;
  const requestTimestamps = !!timestamp_granularities?.length;

  log.debug(
    `[Voice/Regolo] Transcribing ${filename} (${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB)`
  );

  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeTypeFromFilename(filename) });
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', WHISPER_MODEL);
  form.append('language', language);

  if (requestTimestamps) {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
  }

  const response = await fetch(`${REGOLO_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Regolo transcription failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as WhisperVerboseResponse;
  log.debug(`[Voice/Regolo] Completed: ${data.text.length} chars`);

  const result: TranscriptionResult = { text: data.text, hasTimestamps: false };

  if (requestTimestamps && data.segments) {
    result.segments = data.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
    result.hasTimestamps = true;
  }

  return result;
}

/**
 * Transcribe using Regolo Whisper with Mistral Voxtral fallback.
 * Diarize/contextBias require Voxtral (Whisper doesn't support them).
 */
async function transcribeBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const needsVoxtral = options.diarize || options.contextBias?.length;

  if (needsVoxtral) {
    log.debug('[Voice] Using Voxtral (diarize/contextBias requested)');
    return (await mistralVoiceService.transcribeFromBuffer(
      audioBuffer,
      filename,
      options
    )) as unknown as TranscriptionResult;
  }

  if (process.env.REGOLO_API_KEY) {
    try {
      return await transcribeWithRegoloWhisper(audioBuffer, filename, options);
    } catch (error) {
      log.warn(
        `[Voice] Regolo Whisper failed, falling back to Voxtral: ${(error as Error).message}`
      );
    }
  }

  return (await mistralVoiceService.transcribeFromBuffer(
    audioBuffer,
    filename,
    options
  )) as unknown as TranscriptionResult;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/voice/transcribe
 * Transcribe audio file — prefers Regolo Whisper, falls back to Voxtral
 */
router.post(
  '/transcribe',
  upload.single('audio'),
  async (req: TranscribeRequest, res: Response<TranscribeResponse>) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Keine Audio-Datei erhalten',
      });
    }

    let audioBuffer = req.file.buffer;
    let filename = req.file.originalname;

    const options: TranscriptionOptions = {
      language: req.query.language || req.body.language || 'de',
      removeTimestamps: req.query.removeTimestamps === 'true' || req.body.removeTimestamps === true,
      timestamp_granularities:
        req.query.timestamps === 'true' || req.body.timestamps === true ? ['segment'] : undefined,
      diarize: req.query.diarize === 'true' || req.body.diarize === true,
      contextBias: req.body.contextBias,
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

      return res.json({
        success: true,
        text: result.text,
        segments: result.segments,
        hasTimestamps: result.hasTimestamps,
        speakerMap,
        language: options.language,
      });
    } catch (error) {
      log.error('[Voice] Transcription error:', error);

      return res.status(500).json({
        success: false,
        error: 'Fehler bei der Transkription: ' + (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/voice/transcribe/stream
 * Streaming transcription — returns SSE events as text is transcribed.
 * For video files, also emits extraction_progress/extraction_complete events.
 * Supports diarize/timestamps — when enabled, uses non-streaming transcription
 * but still wraps in SSE for consistent progress feedback.
 */
router.post(
  '/transcribe/stream',
  upload.single('audio'),
  async (req: TranscribeRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Keine Audio-Datei erhalten',
      });
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
          timestamp_granularities: timestamps ? ['segment'] : undefined,
          diarize: diarize || undefined,
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
  }
);

/**
 * POST /api/voice/transcribe-url
 * Transcribe audio from URL
 */
router.post(
  '/transcribe-url',
  async (req: TranscribeUrlRequest, res: Response<TranscribeUrlResponse>) => {
    const {
      url,
      language = 'de',
      removeTimestamps = false,
      timestamps = false,
      diarize = false,
      contextBias,
    } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Audio URL ist erforderlich',
      });
    }

    const options: TranscriptionOptions = {
      language,
      removeTimestamps,
      timestamp_granularities: timestamps ? ['segment'] : undefined,
      diarize,
      contextBias,
    };

    try {
      log.debug('[Voice] Starting URL transcription for:', url, 'Options:', options);

      const result = (await mistralVoiceService.transcribeFromUrl(
        url,
        options
      )) as unknown as TranscriptionResult;

      return res.json({
        success: true,
        text: result.text,
        segments: result.segments,
        hasTimestamps: result.hasTimestamps,
        language: options.language,
        sourceUrl: url,
      });
    } catch (error) {
      log.error('[Voice] URL transcription error:', error);

      return res.status(500).json({
        success: false,
        error: 'Fehler bei der URL-Transkription: ' + (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/voice/chat
 * Chat with audio input
 */
router.post(
  '/chat',
  upload.single('audio'),
  async (req: ChatRequest, res: Response<ChatResponse>) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Keine Audio-Datei erhalten',
      });
    }

    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname;
    const prompt = req.body.prompt || req.query.prompt || 'Was ist in dieser Audio-Datei?';

    try {
      log.debug('[Voice] Starting audio chat for:', filename, 'Prompt:', prompt);

      const response: string = await mistralVoiceService.chatWithAudio(
        audioBuffer,
        filename,
        prompt
      );

      return res.json({
        success: true,
        response,
        prompt,
      });
    } catch (error) {
      log.error('[Voice] Audio chat error:', error);

      return res.status(500).json({
        success: false,
        error: 'Fehler beim Audio-Chat: ' + (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/voice/protokoll
 * Generate a structured protocol from transcription text using GPT-OSS via LiteLLM
 */
router.post('/protokoll', async (req: Request, res: Response) => {
  const { inputText, protokollTyp } = req.body;

  if (!inputText) {
    return res.status(400).json({ success: false, error: 'Kein Text angegeben' });
  }

  try {
    const content = await generateProtokoll({
      inputText,
      protokollTyp: protokollTyp || 'Sitzungsprotokoll',
    });
    return res.json({ success: true, content });
  } catch (error) {
    log.error('[Voice] Protokoll error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Protokoll-Erstellung: ' + (error as Error).message,
    });
  }
});

/**
 * POST /api/voice/identify-speakers
 * Use GPT-OSS to identify speaker names from diarized transcription context
 */
router.post('/identify-speakers', async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, error: 'Kein Text angegeben' });
  }

  try {
    const mapping = await identifySpeakers(text);
    return res.json({ success: true, mapping });
  } catch (error) {
    log.error('[Voice] Speaker identification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Sprecher*innen-Erkennung: ' + (error as Error).message,
    });
  }
});

/**
 * POST /api/voice/todo-list
 * Extract action items from transcription text via GPT-OSS and return as checklist HTML
 */
router.post('/todo-list', async (req: Request, res: Response) => {
  const { text, title } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, error: 'Kein Text angegeben' });
  }

  try {
    const html = await extractTodoList(text, title);
    return res.json({ success: true, content: html });
  } catch (error) {
    log.error('[Voice] Todo list error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Aufgaben-Extraktion: ' + (error as Error).message,
    });
  }
});

/**
 * GET /api/voice/formats
 * Get supported audio formats
 */
router.get('/formats', (_req: Request, res: Response<FormatsResponse>) => {
  try {
    const formats = [...mistralVoiceService.getSupportedFormats(), ...Array.from(VIDEO_MIME_TYPES)];

    return res.json({
      success: true,
      supportedFormats: formats,
      maxFileSize: '500MB (video), 50MB (audio)',
      maxDuration: '~30 minutes for transcription, ~40 minutes for understanding',
      provider: process.env.REGOLO_API_KEY
        ? 'Regolo Whisper (Voxtral fallback, video converted via FFmpeg)'
        : 'Mistral Voxtral (video converted via FFmpeg)',
    });
  } catch (error) {
    log.error('[Voice] Formats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der unterstützten Formate',
    });
  }
});

export default router;
