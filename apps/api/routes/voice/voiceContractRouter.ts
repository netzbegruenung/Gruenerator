/**
 * ts-rest contract router for voice endpoints.
 *
 * Covers:
 *   POST /api/voice/transcribe-upload
 *   POST /api/voice/transcribe-url
 *   POST /api/voice/protokoll
 *   POST /api/voice/identify-speakers
 *   POST /api/voice/todo-list
 *   GET  /api/voice/formats
 *
 * Mount BEFORE the legacy voiceController router in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the
 * legacy router (which handles multer/multipart routes).
 *
 * No requireAuth at the prefix — voice routes are public per legacy router.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { voiceContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { env } from '../../config/env.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getUploadStatus,
} from '../../services/subtitler/tusService.js';
import { extractAudio, cleanupFiles } from '../../services/subtitler/videoUploadService.js';
import mistralVoiceService from '../../services/voice/mistralVoiceService.js';
import {
  generateProtokoll,
  identifySpeakers,
  extractTodoList,
} from '../../services/voice/protokollService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { sanitizeFilename } from '../../utils/validation/security.js';

import type { Application } from 'express';

const log = createLogger('voiceContractRouter');

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
  return mimeMap[ext ?? ''] ?? 'audio/wav';
}

const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
const WHISPER_MODEL = 'faster-whisper-large-v3';

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
}

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

interface TranscriptionOptions {
  language?: string;
  removeTimestamps?: boolean;
  timestamp_granularities?: 'segment'[];
  diarize?: boolean;
  contextBias?: string[];
}

async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalname: string
): Promise<{ buffer: Buffer; filename: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-video-'));
  const ext = path.extname(originalname) || '.mp4';
  const videoPath = path.join(tmpDir, `input${ext}`);
  const audioPath = path.join(tmpDir, 'extracted.mp3');

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    await extractAudio(videoPath, audioPath, {});
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename };
  } finally {
    await cleanupFiles(videoPath, audioPath);
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function transcribeWithRegoloWhisper(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const apiKey = env.REGOLO_API_KEY;
  if (!apiKey) throw new Error('REGOLO_API_KEY is not configured');

  const { language = 'de', timestamp_granularities } = options;
  const requestTimestamps = !!timestamp_granularities?.length;

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

  const result: TranscriptionResult = { text: data.text, hasTimestamps: false };

  if (requestTimestamps && data.segments) {
    result.segments = data.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
    result.hasTimestamps = true;
  }

  return result;
}

async function transcribeBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const needsVoxtral = options.diarize || options.contextBias?.length;

  if (needsVoxtral) {
    const result = await mistralVoiceService.transcribeFromBuffer(audioBuffer, filename, options);
    return {
      text: result.text,
      ...(result.segments != null && { segments: result.segments }),
      hasTimestamps: !!result.segments?.length,
    };
  }

  if (env.REGOLO_API_KEY) {
    try {
      return await transcribeWithRegoloWhisper(audioBuffer, filename, options);
    } catch (error) {
      log.warn(
        `[voiceContract] Regolo Whisper failed, falling back to Voxtral: ${(error as Error).message}`
      );
    }
  }

  const result = await mistralVoiceService.transcribeFromBuffer(audioBuffer, filename, options);
  return {
    text: result.text,
    ...(result.segments != null && { segments: result.segments }),
    hasTimestamps: !!result.segments?.length,
  };
}

const s = initServer();

export const voiceContractRouter = s.router(voiceContract, {
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
      let audioBuffer: Buffer = Buffer.from(await fs.promises.readFile(filePath));
      let filename = sanitizeFilename(meta?.filename || 'audio.mp3', 'audio.mp3');
      const filetype = meta?.filetype || '';

      const options: TranscriptionOptions = {
        language: language ?? 'de',
        ...(timestamps && { timestamp_granularities: ['segment'] as const }),
        ...(diarize && { diarize: true }),
      };

      if (isVideoFile(filetype)) {
        const extracted = await extractAudioFromVideo(audioBuffer, filename);
        audioBuffer = extracted.buffer;
        filename = extracted.filename;
      }

      const result = await transcribeBuffer(audioBuffer, filename, options);

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
      log.error('[voiceContract.transcribeUpload] Error:', { error });
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

  transcribeUrl: async (args) => {
    const {
      url,
      language = 'de',
      removeTimestamps = false,
      timestamps = false,
      diarize = false,
      contextBias,
    } = args.body;

    const options: TranscriptionOptions = {
      language: language ?? 'de',
      removeTimestamps: removeTimestamps ?? false,
      ...(timestamps && { timestamp_granularities: ['segment'] as const }),
      diarize: diarize ?? false,
      ...(contextBias != null && { contextBias }),
    };

    try {
      const voxtralResult = await mistralVoiceService.transcribeFromUrl(url, options);
      const result: TranscriptionResult = {
        text: voxtralResult.text,
        ...(voxtralResult.segments != null && { segments: voxtralResult.segments }),
        hasTimestamps: !!voxtralResult.segments?.length,
      };

      return {
        status: 200 as const,
        body: {
          success: true,
          text: result.text,
          ...(result.segments != null && { segments: result.segments }),
          hasTimestamps: result.hasTimestamps,
          language: language ?? 'de',
          sourceUrl: url,
        },
      };
    } catch (error) {
      log.error('[voiceContract.transcribeUrl] Error:', { error });
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der URL-Transkription: ' + (error as Error).message,
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
      log.error('[voiceContract.protokoll] Error:', { error });
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Protokoll-Erstellung: ' + (error as Error).message,
        },
      };
    }
  },

  identifySpeakers: async (args) => {
    const { text } = args.body;

    try {
      const mapping = await identifySpeakers(text);
      return { status: 200 as const, body: { success: true, mapping } };
    } catch (error) {
      log.error('[voiceContract.identifySpeakers] Error:', { error });
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Sprecher*innen-Erkennung: ' + (error as Error).message,
        },
      };
    }
  },

  todoList: async (args) => {
    const { text, title } = args.body;

    try {
      const html = await extractTodoList(text, title ?? undefined);
      return { status: 200 as const, body: { success: true, content: html } };
    } catch (error) {
      log.error('[voiceContract.todoList] Error:', { error });
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Aufgaben-Extraktion: ' + (error as Error).message,
        },
      };
    }
  },

  getFormats: async (_args) => {
    try {
      const formats = [
        ...mistralVoiceService.getSupportedFormats(),
        ...Array.from(VIDEO_MIME_TYPES),
      ];

      return {
        status: 200 as const,
        body: {
          success: true,
          supportedFormats: formats,
          maxFileSize: '500MB (video), 50MB (audio)',
          maxDuration: '~30 minutes for transcription, ~40 minutes for understanding',
          provider: env.REGOLO_API_KEY
            ? 'Regolo Whisper (Voxtral fallback, video converted via FFmpeg)'
            : 'Mistral Voxtral (video converted via FFmpeg)',
        },
      };
    } catch (error) {
      log.error('[voiceContract.getFormats] Error:', { error });
      return {
        status: 500 as const,
        body: { success: false, error: 'Fehler beim Abrufen der unterstützten Formate' },
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
