/**
 * Stufe „fetch" für das Abgeordnetenhaus: Kandidat → Volltext aus dem PDF.
 * PARDOK liefert auch einen Volltext (`f.volltext_anzeigen`), den der Scraper
 * bewusst nicht nutzt (keine Zeilenumbrüche, Konverterfehler als Text) — hier
 * gilt dasselbe: der Text kommt aus dem PDF, und nur von pardok.parlament-berlin.de.
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import {
  type CachedText,
  type FetchedDoc,
  type TextCache,
  fetchBytes,
  readCache,
  writeCache,
} from '../../bundestag/qa/fetchTexts.js';
import { extractPdfText } from '../../pdf/pdfText.js';

import { PARDOK_PDF_HOST } from './documents.js';

const log = createLogger('LandtagBerlinText');

const cacheKey = (c: BundestagCandidate) => `lt:be:text:v1:${c.dipId}:${c.aktualisiert ?? ''}`;

async function fetchOne(
  c: BundestagCandidate,
  redis: TextCache | null,
  signal: AbortSignal
): Promise<CachedText> {
  const hit = await readCache(redis, cacheKey(c));
  if (hit) return hit;
  if (!c.pdfUrl) return { text: '', textSource: 'missing' };
  try {
    const text = (await extractPdfText(await fetchBytes(c.pdfUrl, signal, PARDOK_PDF_HOST))).trim();
    if (!text) return { text: '', textSource: 'missing' };
    const value: CachedText = { text, textSource: 'pdf' };
    await writeCache(redis, cacheKey(c), value);
    return value;
  } catch (error: unknown) {
    log.warn(`PDF nicht lesbar (${c.pdfUrl}): ${String(error)}`);
    return { text: '', textSource: 'missing' };
  }
}

/** Ergebnis in der Reihenfolge der Kandidaten; was nicht zu holen war, trägt `'missing'`. */
export async function fetchBerlinTexts(
  candidates: readonly BundestagCandidate[],
  deps: { redis: TextCache | null; signal: AbortSignal }
): Promise<FetchedDoc[]> {
  return Promise.all(
    candidates.map(async (c) => ({ ...c, ...(await fetchOne(c, deps.redis, deps.signal)) }))
  );
}
