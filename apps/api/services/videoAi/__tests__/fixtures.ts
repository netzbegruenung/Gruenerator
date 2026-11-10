import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { germanNumberWordToDigits } from '../../transcription/germanNumberWords.js';
import { buildTranscriptUnits, type TranscriptUnit } from '../transcriptUnits.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../__fixtures__');

export function fixture(name: string): string {
  return readFileSync(path.join(dir, name), 'utf8');
}

/**
 * GreenPT words of the synthetic raw take "A Radweg" (spike 2026-11-10),
 * number words converted the way listenWithGreenpt converts them.
 */
export function radwegUnits(): Map<string, TranscriptUnit> {
  const raw = JSON.parse(fixture('radweg-words.json')) as Array<{
    word: string;
    start: number;
    end: number;
  }>;
  const words = raw.map((w) => ({ ...w, word: germanNumberWordToDigits(w.word) ?? w.word }));
  return new Map(buildTranscriptUnits('c1', words).map((u) => [u.id, u]));
}

export const RADWEG_DURATION = 68.64;
