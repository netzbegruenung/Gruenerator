/**
 * Shared transcription plumbing for the /api/voice routes.
 *
 * These helpers used to exist twice, near-identically, in voiceController.ts and
 * voiceContractRouter.ts — roughly 150 duplicated lines including the whole
 * provider fallback chain. Two copies of a provider chain is two places to fix
 * a provider bug, and only one of them tends to get fixed.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { MAX_AUDIO_MINUTES } from '@gruenerator/contracts';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { extractAudio, cleanupFiles, getDuration } from '../subtitler/videoUploadService.js';
import { splitAudioIntoChunks } from '../transcription/audioSplitter.js';
import {
  GREENPT_STT_MODEL,
  groupGreenptWords,
  listenWithGreenpt,
} from '../transcription/greenptListen.js';
import { mimeTypeFromFilename } from '../transcription/mimeTypes.js';
import { chooseProvider, type TranscriptionProvider } from '../transcription/providerPolicy.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import mistralVoiceService from './mistralVoiceService.js';

const log = createLogger('voiceTranscription');

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

/**
 * Same extraction as extractAudioFromVideo, but for a video that already sits
 * on disk (a TUS upload) — ffmpeg reads it in place instead of round-tripping
 * the whole file through a Buffer first. That round trip is fine for the
 * multer routes (their video is already an in-memory buffer from the
 * multipart parser), but for TUS uploads it would mean holding an up to
 * MAX_VIDEO_UPLOAD_BYTES-sized Buffer per concurrent request for no reason —
 * the file is already on disk exactly where ffmpeg needs it.
 */
export async function extractAudioFromVideoPath(
  videoPath: string,
  originalname: string,
  options?: ExtractOptions
): Promise<{ buffer: Buffer; filename: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-video-'));
  const audioPath = path.join(tmpDir, 'extracted.mp3');

  try {
    const extractOptions = options?.onProgress != null ? { onProgress: options.onProgress } : {};
    await extractAudio(videoPath, audioPath, extractOptions);
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename };
  } finally {
    await cleanupFiles(audioPath);
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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
 * GreenPT returns a flat word list, so segments and the `[speaker_N]` markers
 * that `identifySpeakers` keys off are assembled here. Same marker format as
 * Voxtral's — the protocol layer must not be able to tell which provider ran.
 */
async function transcribeWithGreenpt(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  const diarize = options.diarize === true;
  const { text, words } = await listenWithGreenpt(audioBuffer, filename, { diarize });

  const wantsTimestamps = !!options.timestamp_granularities?.length || diarize;
  if (!wantsTimestamps || words.length === 0) {
    return { text, hasTimestamps: false };
  }

  const segments = groupGreenptWords(words);
  const hasSpeakers = segments.some((s) => s.speaker !== null);

  return {
    text: hasSpeakers ? segments.map((s) => `[speaker_${s.speaker}] ${s.text}`).join('\n') : text,
    segments: segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
    hasTimestamps: true,
  };
}

/** Per-provider key, billing label and caller. Keeps the chain loop flat. */
const RUNNERS: Record<
  TranscriptionProvider,
  {
    apiKey: () => string | undefined;
    usage: { provider: string; model: string } | null;
    run: (
      audioBuffer: Buffer,
      filename: string,
      options: TranscriptionOptions
    ) => Promise<TranscriptionResult>;
  }
> = {
  // transcribeWithVoxtral records its own operation.
  voxtral: { apiKey: () => env.MISTRAL_API_KEY, usage: null, run: transcribeWithVoxtral },
  greenpt: {
    apiKey: () => env.GREENPT_API_KEY,
    usage: { provider: 'greenpt', model: GREENPT_STT_MODEL },
    run: transcribeWithGreenpt,
  },
};

/**
 * Provider selection via the shared policy — the same rules the subtitler uses
 * (this router used to carry its own, and ignored TRANSCRIPTION_PROVIDER).
 * Every provider the policy did not pick stays in the chain as failover.
 *
 */
async function transcribeSingleBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const { provider, reason, chain } = chooseProvider({
    ...(options.diarize !== undefined && { diarize: options.diarize }),
    ...(options.contextBias !== undefined && { requestedContextBias: options.contextBias }),
    override: env.TRANSCRIPTION_PROVIDER,
  });

  log.info(`[Voice] provider=${provider} (${reason}) chain=${chain.join('→')}`);

  let lastError: Error | null = null;

  for (const attempt of chain) {
    const runner = RUNNERS[attempt];
    if (!runner.apiKey()) continue;

    try {
      const result = await runner.run(audioBuffer, filename, options);
      if (runner.usage) recordOperation({ unit: 'transcriptions', ...runner.usage });
      return result;
    } catch (error) {
      lastError = error as Error;
      log.warn(`[Voice] ${attempt} transcription failed: ${lastError.message}`);
    }
  }

  throw (
    lastError ??
    new Error(
      'No transcription provider configured. Set MISTRAL_API_KEY (Voxtral) or GREENPT_API_KEY (green-s-pro).'
    )
  );
}

function offsetResult(result: TranscriptionResult, offsetSeconds: number): TranscriptionResult {
  if (offsetSeconds === 0 || !result.segments?.length) return result;
  return {
    ...result,
    segments: result.segments.map((s) => ({
      ...s,
      start: s.start + offsetSeconds,
      end: s.end + offsetSeconds,
    })),
  };
}

function mergeResults(results: TranscriptionResult[]): TranscriptionResult {
  const first = results[0];
  if (!first) {
    throw new Error('Cannot merge an empty transcription result set');
  }
  if (results.length === 1) return first;

  return {
    text: results.map((r) => r.text).join('\n'),
    segments: results.flatMap((r) => r.segments ?? []),
    hasTimestamps: results.some((r) => r.hasTimestamps),
  };
}

/**
 * MAX_AUDIO_MINUTES is a per-provider-call ceiling, not a hard rejection limit:
 * anything longer is split into ≤MAX_AUDIO_MINUTES chunks here, transcribed one
 * chunk at a time (sequential, to keep memory/rate-limit exposure bounded the
 * same way a single 500MB buffer already does), and the chunk transcripts are
 * merged back into one continuous result with offset segment timestamps.
 */
export async function transcribeBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const limitSeconds = MAX_AUDIO_MINUTES * 60;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-probe-'));
  const probePath = path.join(tmpDir, `input${path.extname(filename) || '.mp3'}`);

  try {
    await fs.promises.writeFile(probePath, audioBuffer);
    const duration = await getDuration(probePath);

    if (duration == null || duration <= limitSeconds) {
      return await transcribeSingleBuffer(audioBuffer, filename, options);
    }

    log.info(
      `[Voice] audio duration ${Math.round(duration)}s exceeds ${limitSeconds}s — splitting into chunks`
    );
    const { chunks, tmpDir: splitDir } = await splitAudioIntoChunks(
      probePath,
      limitSeconds,
      duration
    );

    try {
      const results: TranscriptionResult[] = [];
      for (const chunk of chunks) {
        const chunkBuffer = await fs.promises.readFile(chunk.path);
        const chunkResult = await transcribeSingleBuffer(chunkBuffer, 'chunk.mp3', options);
        results.push(offsetResult(chunkResult, chunk.startSeconds));
      }
      return mergeResults(results);
    } finally {
      await fs.promises.rm(splitDir, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
