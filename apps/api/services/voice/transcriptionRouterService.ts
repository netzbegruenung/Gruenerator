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
): Promise<{ buffer: Buffer; filename: string; durationSeconds: number | null }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-video-'));
  const ext = path.extname(originalname) || '.mp4';
  const videoPath = path.join(tmpDir, `input${ext}`);
  const audioPath = path.join(tmpDir, 'extracted.mp3');

  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    const extractOptions = options?.onProgress != null ? { onProgress: options.onProgress } : {};
    const { durationSeconds } = await extractAudio(videoPath, audioPath, extractOptions);
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename, durationSeconds };
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
): Promise<{ buffer: Buffer; filename: string; durationSeconds: number | null }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-video-'));
  const audioPath = path.join(tmpDir, 'extracted.mp3');

  try {
    const extractOptions = options?.onProgress != null ? { onProgress: options.onProgress } : {};
    const { durationSeconds } = await extractAudio(videoPath, audioPath, extractOptions);
    const audioBuffer = await fs.promises.readFile(audioPath);
    const audioFilename = originalname.replace(/\.[^.]+$/, '.mp3');
    return { buffer: audioBuffer, filename: audioFilename, durationSeconds };
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
  const wantsTimestamps = !!options.timestamp_granularities?.length;

  for (const attempt of chain) {
    const runner = RUNNERS[attempt];
    if (!runner.apiKey()) continue;

    try {
      const result = await runner.run(audioBuffer, filename, options);
      // Same rule as WORD_TIMESTAMP_CHAIN in transcription/providerPolicy.ts:
      // when timestamps were requested, an answer without them is a failure,
      // not a success — accepting it would let a chunked transcription merge
      // timestamped and timestampless chunks from different providers.
      if (wantsTimestamps && !result.hasTimestamps) {
        lastError = new Error(`${attempt} returned no timestamps although they were requested`);
        log.warn(`[Voice] ${lastError.message} — trying next provider`);
        continue;
      }
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

  // `every`, not `some`: per-chunk failover means chunks can come from
  // different providers, and a merged timeline with silent holes is worse
  // than an honest hasTimestamps: false.
  const hasTimestamps = results.every((r) => r.hasTimestamps);

  return {
    text: results.map((r) => r.text).join('\n'),
    ...(hasTimestamps && { segments: results.flatMap((r) => r.segments ?? []) }),
    hasTimestamps,
  };
}

/**
 * Each chunk transcription numbers its speakers from 0 independently, so
 * chunk 2's `[speaker_0]` may be a different person than chunk 1's. Shift a
 * chunk's labels by a running offset so they are globally unique across the
 * merged transcript — downstream `identifySpeakers` then maps the union.
 * Sparse ids are kept sparse; the offset advances past the highest id seen.
 */
function remapChunkSpeakers(
  result: TranscriptionResult,
  idOffset: number
): { result: TranscriptionResult; maxIdSeen: number } {
  let maxIdSeen = -1;
  const text = result.text.replace(/\[speaker_(\d+)\]/g, (_match, digits: string) => {
    const id = Number(digits);
    if (id > maxIdSeen) maxIdSeen = id;
    return `[speaker_${id + idOffset}]`;
  });
  return { result: { ...result, text }, maxIdSeen };
}

/**
 * Below ~8 kbit/s even MAX_AUDIO_MINUTES of audio stays under this size, so a
 * smaller buffer cannot exceed the chunk threshold and the duration probe
 * (temp-file write + ffprobe) is skipped entirely. Real speech encodings sit
 * well above 8 kbit/s — the video-extraction path emits mono 16 kHz mp3 at
 * roughly 4× that.
 */
const PROBE_SKIP_BYTES = (8_000 / 8) * MAX_AUDIO_MINUTES * 60;

export function mayExceedChunkLimit(audioBuffer: Buffer): boolean {
  return audioBuffer.length >= PROBE_SKIP_BYTES;
}

/** Measure a buffer's media duration via ffprobe (temp-file round trip). */
export async function probeBufferDurationSeconds(
  audioBuffer: Buffer,
  filename: string
): Promise<number | null> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-probe-'));
  const probePath = path.join(tmpDir, `input${path.extname(filename) || '.mp3'}`);
  try {
    await fs.promises.writeFile(probePath, audioBuffer);
    return await getDuration(probePath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * MAX_AUDIO_MINUTES is a per-provider-call ceiling, not a hard rejection limit:
 * anything longer is split into ≤MAX_AUDIO_MINUTES chunks here, transcribed one
 * chunk at a time (sequential, to keep memory/rate-limit exposure bounded the
 * same way a single 500MB buffer already does), and the chunk transcripts are
 * merged back into one continuous result with offset segment timestamps.
 *
 * `knownDurationSeconds` lets callers that already measured the duration (the
 * video-extraction path — extractAudio ffprobes its input anyway) skip the
 * probe here.
 */
export async function transcribeBuffer(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {},
  knownDurationSeconds?: number | null
): Promise<TranscriptionResult> {
  const limitSeconds = MAX_AUDIO_MINUTES * 60;

  if (
    (knownDurationSeconds == null && !mayExceedChunkLimit(audioBuffer)) ||
    (knownDurationSeconds != null && knownDurationSeconds <= limitSeconds)
  ) {
    return transcribeSingleBuffer(audioBuffer, filename, options);
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-probe-'));
  const probePath = path.join(tmpDir, `input${path.extname(filename) || '.mp3'}`);

  try {
    await fs.promises.writeFile(probePath, audioBuffer);
    const duration = knownDurationSeconds ?? (await getDuration(probePath));

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
      let speakerIdOffset = 0;
      for (const chunk of chunks) {
        const chunkBuffer = await fs.promises.readFile(chunk.path);
        let chunkResult = await transcribeSingleBuffer(chunkBuffer, 'chunk.mp3', options);
        if (options.diarize) {
          const remapped = remapChunkSpeakers(chunkResult, speakerIdOffset);
          chunkResult = remapped.result;
          speakerIdOffset += remapped.maxIdSeen + 1;
        }
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
