/**
 * German-aware sentence boundary detection for TTS pipelining.
 *
 * Splits text into complete sentences so each can be sent to TTS
 * independently while the LLM continues generating. Handles common
 * German abbreviations that contain periods but aren't sentence endings.
 */

const ABBREVIATIONS = new Set([
  'z.b.',
  'd.h.',
  'usw.',
  'bzw.',
  'ca.',
  'nr.',
  'dr.',
  'prof.',
  'mio.',
  'mrd.',
  'ggf.',
  'u.a.',
  'o.ä.',
  'etc.',
  'vgl.',
  'zzgl.',
  'inkl.',
  'max.',
  'min.',
  'abs.',
  'art.',
  'std.',
  'tel.',
  'str.',
  'evtl.',
  'bspw.',
  'sog.',
  'gem.',
  'ggü.',
  'i.d.r.',
  'u.u.',
]);

const SENTENCE_END_RE = /([.!?:])(\s+)/g;

export interface SplitResult {
  complete: string[];
  remainder: string;
}

export function splitSentences(text: string): SplitResult {
  const complete: string[] = [];
  let lastIndex = 0;

  SENTENCE_END_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END_RE.exec(text)) !== null) {
    const candidateEnd = match.index + match[1].length;
    const candidate = text.slice(lastIndex, candidateEnd).trim();

    if (candidate.length === 0) continue;

    if (isAbbreviation(text, match.index)) {
      continue;
    }

    // Skip single-char "sentences" (e.g., numbering like "1. ")
    if (candidate.length <= 2) continue;

    complete.push(candidate);
    lastIndex = candidateEnd + match[2].length;
  }

  const remainder = text.slice(lastIndex).trim();

  return { complete, remainder };
}

function isAbbreviation(text: string, dotIndex: number): boolean {
  // Look backwards from the dot to find the word
  let start = dotIndex;
  while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') {
    start--;
  }
  const word = text.slice(start, dotIndex + 1).toLowerCase();
  return ABBREVIATIONS.has(word);
}
