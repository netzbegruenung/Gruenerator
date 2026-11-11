import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { germanNumberWordToDigits } from '../../transcription/germanNumberWords.js';
import {
  buildTranscriptUnits,
  type TranscriptUnit,
  type TranscriptWord,
} from '../transcriptUnits.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../__fixtures__');

export function fixture(name: string): string {
  return readFileSync(path.join(dir, name), 'utf8');
}

/**
 * GreenPT words of the synthetic raw take "A Radweg" (spike 2026-11-10),
 * number words converted the way listenWithGreenpt converts them.
 */
export function radwegWords(): TranscriptWord[] {
  const raw = JSON.parse(fixture('radweg-words.json')) as TranscriptWord[];
  return raw.map((w) => ({ ...w, word: germanNumberWordToDigits(w.word) ?? w.word }));
}

export function radwegUnits(): Map<string, TranscriptUnit> {
  return new Map(buildTranscriptUnits('c1', radwegWords()).map((u) => [u.id, u]));
}

export const RADWEG_DURATION = 68.64;
