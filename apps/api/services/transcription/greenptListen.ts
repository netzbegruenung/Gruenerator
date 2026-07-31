/**
 * GreenPT speech-to-text (`/v1/listen`, Deepgram-compatible).
 *
 * One module for both callers — the subtitler wants word timestamps, the voice
 * router wants speaker-attributed segments, but the request is the same and a
 * second copy of the query string is a second place for the parameter decisions
 * below to rot.
 */

import { createLogger } from '../../utils/logger.js';

import { convertGermanNumberWords, germanNumberWordToDigits } from './germanNumberWords.js';
import { mimeTypeFromFilename } from './mimeTypes.js';

const log = createLogger('greenpt-transcription');

export const GREENPT_LISTEN_URL = 'https://api.greenpt.ai/v1/listen';

/**
 * `green-s-pro` is the only model with automatic language detection, and
 * `language=multi` measurably beats `language=de` on German broadcast audio —
 * the monolingual variant silently dropped ~30 words from the same clip.
 * Costs €0.28/h instead of €0.23/h; the missing words are worth the 5 cents.
 *
 * `smart_format` stays OFF: documented as English-only and unsupported on
 * green-s-pro, and switching it on for German corrupts numerals and
 * capitalisation. See germanNumberWords.ts for the measurements and the
 * conversion that replaces it.
 */
export const GREENPT_STT_MODEL = 'green-s-pro';

export interface GreenptWord {
  word: string;
  start: number;
  end: number;
  /** Diarization label as an index; absent when diarization was not requested. */
  speaker: number | null;
}

export interface GreenptListenResult {
  text: string;
  words: GreenptWord[];
}

interface RawWord {
  word?: unknown;
  punctuated_word?: unknown;
  start?: unknown;
  end?: unknown;
  speaker?: unknown;
}

interface RawResponse {
  results?: {
    channels?: Array<{ alternatives?: Array<{ transcript?: unknown; words?: unknown }> }>;
  };
}

export interface GreenptSegment {
  start: number;
  end: number;
  text: string;
  /** null when diarization was not requested. */
  speaker: number | null;
}

/**
 * GreenPT answers with a flat word list; the voice layer wants segments.
 *
 * A segment breaks on a speaker change (so `[speaker_N]` markers can be
 * attached, which is what `identifySpeakers` keys off) or at a sentence end,
 * whichever comes first — the latter keeps segments usable when diarization is
 * off and there are no speaker changes to break on.
 */
export function groupGreenptWords(words: readonly GreenptWord[]): GreenptSegment[] {
  const segments: GreenptSegment[] = [];
  let current: { start: number; end: number; tokens: string[]; speaker: number | null } | null =
    null;

  for (const word of words) {
    if (current !== null && current.speaker !== word.speaker) {
      segments.push({
        start: current.start,
        end: current.end,
        text: current.tokens.join(' '),
        speaker: current.speaker,
      });
      current = null;
    }

    if (current === null) {
      current = { start: word.start, end: word.end, tokens: [], speaker: word.speaker };
    }

    current.tokens.push(word.word);
    current.end = word.end;

    if (/[.!?]$/.test(word.word)) {
      segments.push({
        start: current.start,
        end: current.end,
        text: current.tokens.join(' '),
        speaker: current.speaker,
      });
      current = null;
    }
  }

  if (current !== null) {
    segments.push({
      start: current.start,
      end: current.end,
      text: current.tokens.join(' '),
      speaker: current.speaker,
    });
  }

  return segments;
}

export interface GreenptListenOptions {
  /** Speaker diarization. Free, and v2 is the current generally available model. */
  diarize?: boolean;
}

/**
 * Throws rather than degrading: a shape change upstream must surface as a
 * failed request the chain can fail over, not as an empty transcript that
 * looks like silent audio.
 */
export async function listenWithGreenpt(
  audio: Buffer,
  filename: string,
  options: GreenptListenOptions = {}
): Promise<GreenptListenResult> {
  // process.env at call time, so tests that unset the key take effect against
  // the import-time-cached `env` module.
  const apiKey = process.env.GREENPT_API_KEY;
  if (!apiKey) {
    throw new Error('GREENPT_API_KEY is not configured');
  }

  const query = new URLSearchParams({
    model: GREENPT_STT_MODEL,
    language: 'multi',
    punctuate: 'true',
    smart_format: 'false',
  });
  if (options.diarize === true) {
    query.set('diarize_model', 'v2');
  }

  const response = await fetch(`${GREENPT_LISTEN_URL}?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeTypeFromFilename(filename),
    },
    body: new Uint8Array(audio),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GreenPT transcription failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as RawResponse;
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  if (alternative === undefined || typeof alternative.transcript !== 'string') {
    throw new Error('GreenPT returned no transcript alternative');
  }

  const rawWords: RawWord[] = Array.isArray(alternative.words) ? alternative.words : [];
  const words: GreenptWord[] = [];
  for (const raw of rawWords) {
    // punctuated_word is what the transcript string is built from; the bare
    // `word` is lowercased and unpunctuated and would not align with it.
    const token = typeof raw.punctuated_word === 'string' ? raw.punctuated_word : raw.word;
    if (typeof token !== 'string' || !Number.isFinite(raw.start) || !Number.isFinite(raw.end)) {
      continue;
    }
    words.push({
      word: germanNumberWordToDigits(token) ?? token,
      start: raw.start as number,
      end: raw.end as number,
      speaker: typeof raw.speaker === 'number' ? raw.speaker : null,
    });
  }

  log.debug(
    `GreenPT transcription completed: ${alternative.transcript.length} chars, ${words.length} words`
  );

  return {
    // Same conversion, same tokens: transcript and word array must stay aligned
    // or the subtitle position mapping falls back to a word join.
    text: convertGermanNumberWords(alternative.transcript),
    words,
  };
}
