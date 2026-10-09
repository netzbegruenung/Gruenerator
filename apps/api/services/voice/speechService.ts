import {
  type SpeechFile,
  type SpeechOutputFormat,
  type SpeechPreset,
  type TreeBudgetStatus,
} from '@gruenerator/contracts';

import { getSharedMediaService } from '../sharedMediaService.js';
import {
  getTreeBudget,
  treeCostForSpeechSeconds,
  toTreeBudgetStatusDto,
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
} from '../trees/index.js';

import { pcm16ToWav } from './pcmCodec.js';
import { chunkForSpeech } from './speechChunker.js';
import { encodeSpeech, type EncodedSpeech } from './speechEncoder.js';
import ttsService, { type PcmSpeech, type TTSOptions } from './ttsService.js';

import type { AudioShareResult, CreateAudioShareParams } from '../../types/media.js';
import type { TreeBalance, TreeBudget } from '../trees/index.js';

/** Silence between two provider requests, so a joined text does not run on. */
const CHUNK_GAP_MS = 300;
/** Rough German speaking rate, for the pre-check only; the booking uses real seconds. */
const CHARS_PER_SECOND = 15;

const PRESET_TITLE: Record<SpeechPreset, string> = {
  mailbox: 'Anrufbeantworter-Ansage',
  vorlesefassung: 'Vorlesefassung',
  audiodeskription: 'Audiodeskription',
};

export interface GenerateSpeechInput {
  preset: SpeechPreset;
  text: string;
  formats: readonly SpeechOutputFormat[];
  voiceId: string | null;
  speed: number | null;
  signal: AbortSignal | null;
  /**
   * Name of the Mediathek row. Null falls back to the preset's name, which is
   * what the tool page sends — there the person picked the preset and sees the
   * file appear. A caller that knows what the text is ABOUT (the chat tool)
   * passes a real title, so the library does not fill up with rows all called
   * "Vorlesefassung".
   */
  title?: string | null;
}

/** The media title column is not the place for a whole paragraph. */
const MAX_TITLE_CHARS = 120;

export interface GenerateSpeechOutput {
  durationSeconds: number;
  chunks: number;
  files: SpeechFile[];
  quota: TreeBudgetStatus;
}

/** Seams for the unit test; production wiring is `defaultDeps()`. */
export interface SpeechDeps {
  generatePcm: (text: string, options: TTSOptions) => Promise<PcmSpeech>;
  encode: (wav: Buffer, format: SpeechOutputFormat) => Promise<EncodedSpeech>;
  createAudioShare: (userId: string, params: CreateAudioShareParams) => Promise<AudioShareResult>;
  budget: Pick<TreeBudget, 'reserve' | 'adjust'>;
}

function defaultDeps(): SpeechDeps {
  return {
    generatePcm: (text, options) => ttsService.generatePcm(text, options),
    encode: encodeSpeech,
    createAudioShare: (userId, params) => getSharedMediaService().createAudioShare(userId, params),
    budget: getTreeBudget(),
  };
}

/** One stretch of speech in one voice — a whole text, or one podcast turn. */
export interface SpeechSegment {
  text: string;
  voiceId: string | null;
}

export interface SynthesizeOptions {
  speed: number | null;
  signal: AbortSignal | null;
  /** Silence between two segments; chunks inside a segment keep CHUNK_GAP_MS. */
  segmentGapMs?: number;
}

export interface SynthesizedSpeech {
  /** Joined PCM16 mono. */
  pcm: Buffer;
  sampleRate: number;
  durationSeconds: number;
  chunks: number;
  quota: TreeBalance;
}

/**
 * Segments → one PCM stream, booked against the tree budget.
 *
 * Chunks are synthesised one after the other — the provider limits concurrency
 * per account (#3208), and in-order arrival keeps the join trivial.
 */
export async function synthesizeSegments(
  userId: string,
  segments: readonly SpeechSegment[],
  options: SynthesizeOptions,
  deps: Pick<SpeechDeps, 'generatePcm' | 'budget'> = defaultDeps()
): Promise<SynthesizedSpeech> {
  const totalChars = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  const estimateUnits = treeCostForSpeechSeconds(Math.ceil(totalChars / CHARS_PER_SECOND));
  const reservation = await deps.budget.reserve(userId, estimateUnits);
  if (!reservation.ok) {
    if (reservation.reason === 'exceeded') {
      throw new TreeBudgetExceededError(reservation.status, estimateUnits);
    }
    throw new TreeBudgetUnavailableError();
  }

  const parts: Buffer[] = [];
  let sampleRate = 0;
  let totalBytes = 0;
  let chunkCount = 0;
  let quota: TreeBalance;
  const silence = (ms: number) => Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);
  try {
    for (const [segmentIndex, segment] of segments.entries()) {
      for (const [chunkIndex, chunk] of chunkForSpeech(segment.text).entries()) {
        const piece = await deps.generatePcm(chunk, {
          language: 'de',
          ...(segment.voiceId ? { voiceId: segment.voiceId } : {}),
          ...(options.speed !== null ? { speed: options.speed } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (sampleRate && piece.sampleRate !== sampleRate) {
          throw new Error(
            `KugelAudio lieferte ${piece.sampleRate} Hz nach ${sampleRate} Hz — Abschnitte lassen sich nicht zusammenfügen`
          );
        }
        sampleRate = piece.sampleRate;
        // Two bytes per PCM16 sample; the gap is whole samples of silence.
        if (parts.length > 0) {
          parts.push(
            silence(
              chunkIndex === 0 && segmentIndex > 0
                ? (options.segmentGapMs ?? CHUNK_GAP_MS)
                : CHUNK_GAP_MS
            )
          );
        }
        parts.push(piece.pcm);
        chunkCount += 1;
        totalBytes = parts.reduce((sum, part) => sum + part.length, 0);
      }
    }
  } finally {
    // Reconcile with what was really generated — on failure or abort too: the
    // provider was paid for those chunks, and a retry must not get them free.
    const realSeconds = sampleRate ? totalBytes / 2 / sampleRate : 0;
    quota = await deps.budget.adjust(
      userId,
      treeCostForSpeechSeconds(Math.round(realSeconds)) - estimateUnits,
      // A synthesis takes tens of seconds and can cross UTC midnight; the
      // correction belongs to the day the reservation was booked on.
      reservation.status.day
    );
  }

  return {
    pcm: Buffer.concat(parts),
    sampleRate,
    durationSeconds: totalBytes / 2 / sampleRate,
    chunks: chunkCount,
    quota,
  };
}

/**
 * Text → one Mediathek row per requested format.
 *
 * One synthesis, N encodes: the provider is paid per generated second, so the
 * formats share the same audio rather than asking for it twice.
 */
export async function generateSpeechFiles(
  userId: string,
  input: GenerateSpeechInput,
  deps: SpeechDeps = defaultDeps()
): Promise<GenerateSpeechOutput> {
  const speech = await synthesizeSegments(
    userId,
    [{ text: input.text, voiceId: input.voiceId }],
    { speed: input.speed, signal: input.signal },
    deps
  );

  if (input.signal?.aborted) {
    throw new Error('Die Verbindung wurde beendet, bevor die Datei fertig war.');
  }

  const { durationSeconds } = speech;
  const wav = pcm16ToWav(speech.pcm, speech.sampleRate);
  const title = input.title?.trim().slice(0, MAX_TITLE_CHARS) || PRESET_TITLE[input.preset];

  // The formats share one synthesis; encoding them at the same time costs a
  // second ffmpeg process and saves the second encode's wall clock.
  const encodedFiles = await Promise.all(
    input.formats.map(async (format) => ({ format, encoded: await deps.encode(wav, format) }))
  );

  const files: SpeechFile[] = [];
  for (const { format, encoded } of encodedFiles) {
    const share = await deps.createAudioShare(userId, { ...encoded, title, durationSeconds });
    files.push({
      format,
      mediaId: share.id,
      shareToken: share.shareToken,
      mimeType: encoded.mimeType,
      fileSize: encoded.buffer.length,
      shareUrl: share.shareUrl,
    });
  }

  return {
    durationSeconds: Math.round(durationSeconds * 10) / 10,
    chunks: speech.chunks,
    files,
    quota: toTreeBudgetStatusDto(speech.quota),
  };
}
