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

/**
 * Text → one Mediathek row per requested format.
 *
 * One synthesis, N encodes: the provider is paid per generated second, so the
 * formats share the same audio rather than asking for it twice. Chunks are
 * synthesised one after the other — the provider limits concurrency per
 * account (#3208), and in-order arrival keeps the join trivial.
 */
export async function generateSpeechFiles(
  userId: string,
  input: GenerateSpeechInput,
  deps: SpeechDeps = defaultDeps()
): Promise<GenerateSpeechOutput> {
  const estimateUnits = treeCostForSpeechSeconds(Math.ceil(input.text.length / CHARS_PER_SECOND));
  const reservation = await deps.budget.reserve(userId, estimateUnits);
  if (!reservation.ok) {
    if (reservation.reason === 'exceeded') {
      throw new TreeBudgetExceededError(reservation.status, estimateUnits);
    }
    throw new TreeBudgetUnavailableError();
  }

  const chunks = chunkForSpeech(input.text);
  const parts: Buffer[] = [];
  let sampleRate = 0;
  let totalBytes = 0;
  let quota: TreeBalance;
  try {
    for (const chunk of chunks) {
      const piece = await deps.generatePcm(chunk, {
        language: 'de',
        ...(input.voiceId ? { voiceId: input.voiceId } : {}),
        ...(input.speed !== null ? { speed: input.speed } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (sampleRate && piece.sampleRate !== sampleRate) {
        throw new Error(
          `KugelAudio lieferte ${piece.sampleRate} Hz nach ${sampleRate} Hz — Abschnitte lassen sich nicht zusammenfügen`
        );
      }
      sampleRate = piece.sampleRate;
      // Two bytes per PCM16 sample; the gap is whole samples of silence.
      if (parts.length > 0) {
        parts.push(Buffer.alloc(Math.round((sampleRate * CHUNK_GAP_MS) / 1000) * 2));
      }
      parts.push(piece.pcm);
      totalBytes = parts.reduce((sum, part) => sum + part.length, 0);
    }
  } finally {
    // Reconcile with what was really generated — on failure or abort too: the
    // provider was paid for those chunks, and a retry must not get them free.
    const realSeconds = sampleRate ? totalBytes / 2 / sampleRate : 0;
    quota = await deps.budget.adjust(
      userId,
      treeCostForSpeechSeconds(Math.round(realSeconds)) - estimateUnits
    );
  }

  if (input.signal?.aborted) {
    throw new Error('Die Verbindung wurde beendet, bevor die Datei fertig war.');
  }

  const durationSeconds = totalBytes / 2 / sampleRate;
  // One WAV buffer; the joined PCM only lives inside the concat.
  const wav = pcm16ToWav(Buffer.concat(parts), sampleRate);
  parts.length = 0;
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
    chunks: chunks.length,
    files,
    quota: toTreeBudgetStatusDto(quota),
  };
}
