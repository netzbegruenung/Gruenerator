/**
 * Shared transcription plumbing for the /api/voice routes.
 *
 * These helpers used to exist twice, near-identically, in voiceController.ts and
 * voiceContractRouter.ts — roughly 150 duplicated lines including the whole
 * Regolo→Voxtral fallback. Two copies of a provider chain is two places to fix
 * a provider bug, and only one of them tends to get fixed.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { extractAudio, cleanupFiles } from '../subtitler/videoUploadService.js';
import { probeBufferDurationSeconds } from '../transcription/audioDuration.js';
import { mimeTypeFromFilename } from '../transcription/mimeTypes.js';
import { chooseProvider } from '../transcription/providerPolicy.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import mistralVoiceService from './mistralVoiceService.js';

const log = createLogger('voiceTranscription');

export const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
export const WHISPER_MODEL = 'faster-whisper-large-v3';

export const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
]);

export function isVideoFile(mimetype: string): boolean {
  return VIDEO_MIME_TYPES.has(mimetype) || mimetype.startsWith('video/');
}

export { mimeTypeFromFilename };

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments?: TranscriptionSegment[];
  hasTimestamps: boolean;
}

export interface TranscriptionOptions {
  language?: string;
  removeTimestamps?: boolean;
  timestamp_granularities?: 'segment'[];
  diarize?: boolean;
  contextBias?: string[];
  /**
   * Media length in seconds, when the caller already knows it. Saves the
   * temp-file probe in transcribeBuffer; omit it and the buffer is probed.
   */
  durationSeconds?: number | null;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: TranscriptionSegment[];
}

export interface ExtractOptions {
  onProgress?: (percent: number, timemark: string) => void;
}

export async function extractAudioFromVideo(
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
    const extractOptions = options?.onProgress != null ? { onProgress: options.onProgress } : {};
    await extractAudio(videoPath, audioPath, extractOptions);
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename };
  } finally {
    await cleanupFiles(videoPath, audioPath);
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function transcribeWithRegoloWhisper(
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

async function transcribeWithVoxtral(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  const result = await mistralVoiceService.transcribeFromBuffer(audioBuffer, filename, options);
  recordOperation({ unit: 'transcriptions', provider: 'mistral', model: 'voxtral' });
  return {
    text: result.text,
    ...(result.segments != null && { segments: result.segments }),
    hasTimestamps: !!result.segments?.length,
  };
}

/**
 * Provider selection via the shared policy — the same rules the subtitler uses
 * (this router used to carry its own, and ignored TRANSCRIPTION_PROVIDER).
 * Whichever provider loses is still the fallback if the winner errors.
 */
export async function transcribeBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Buffer-only entry point: probe via a temp file unless the caller already
  // knows the length (the upload routes do — they have a path in hand).
  const durationSeconds =
    options.durationSeconds ?? (await probeBufferDurationSeconds(audioBuffer, filename));

  const { provider, reason } = chooseProvider({
    durationSeconds,
    ...(options.diarize !== undefined && { diarize: options.diarize }),
    ...(options.contextBias !== undefined && { requestedContextBias: options.contextBias }),
    override: env.TRANSCRIPTION_PROVIDER,
  });

  log.info(
    `[Voice] provider=${provider} (${reason}) duration=${durationSeconds === null ? 'unknown' : `${Math.round(durationSeconds)}s`}`
  );

  if (provider === 'regolo' && env.REGOLO_API_KEY) {
    try {
      const result = await transcribeWithRegoloWhisper(audioBuffer, filename, options);
      recordOperation({ unit: 'transcriptions', provider: 'regolo', model: WHISPER_MODEL });
      return result;
    } catch (error) {
      log.warn(
        `[Voice] Regolo Whisper failed, falling back to Voxtral: ${(error as Error).message}`
      );
    }
  }

  return transcribeWithVoxtral(audioBuffer, filename, options);
}
