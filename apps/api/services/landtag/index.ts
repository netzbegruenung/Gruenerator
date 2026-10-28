/**
 * Fassade der Landtage: `landtag` (Liste) und `parlament_lesen` mit
 * `quelle: <Parlament>` rufen nur diese zwei Funktionen. Gelesen wird mit
 * derselben Maschinerie wie beim Bundestag (`readDocuments`: isolierte
 * Fenster, Zitat per `locateQuote` geprüft) — nur Quelle und Prompt-Herkunft
 * unterscheiden sich.
 */
import {
  type BundestagAuftrag,
  type LandtagFilter,
  type LandtagParlament,
} from '@gruenerator/contracts';

import { CHAT_BUDGET, type Budget } from '../bundestag/qa/budget.js';
import { type TextCache } from '../bundestag/qa/fetchTexts.js';
import { type ReadDocumentInfo, toDocumentInfo } from '../bundestag/qa/index.js';
import { keywordsFromQuestion } from '../bundestag/qa/plan.js';
import { readDocuments } from '../bundestag/qa/read.js';

import { LANDTAG_BACKENDS } from './backends.js';
import { type LandtagFindResult } from './berlin/find.js';
import { LANDTAGE, type LandtagMeta } from './registry.js';

export { LANDTAGE, landtagMeta } from './registry.js';
export type { LandtagFindResult } from './berlin/find.js';

async function getRedis(): Promise<TextCache | null> {
  // Erst hier laden: der Import baut die Redis-Verbindung auf.
  const { redisClient } = await import('../../utils/redis/index.js');
  return redisClient as unknown as TextCache;
}

export async function findLandtag(
  parlament: LandtagParlament,
  query: string,
  filters: LandtagFilter
): Promise<LandtagFindResult> {
  return LANDTAG_BACKENDS[parlament]().find({ query, filters });
}

/** Welchem Parlament gehört der Ref? `null`, wenn keins ihn als seinen erkennt. */
export function parlamentOfRef(ref: string): LandtagParlament | null {
  const prefix = ref.slice(0, 2);
  const hit = (Object.values(LANDTAGE) as LandtagMeta[]).find((m) => m.refPrefix === prefix);
  return hit?.id ?? null;
}

/** Liest genau diese Refs ohne Antworttext (Chat-Werkzeug `parlament_lesen`, quelle ≠ bundestag). */
export async function readLandtagRefs({
  parlament,
  question,
  refs,
  auftrag = 'frage',
  budget = CHAT_BUDGET,
  fokus,
}: {
  parlament: LandtagParlament;
  question: string;
  refs: string[];
  auftrag?: BundestagAuftrag;
  budget?: Budget;
  fokus?: string | undefined;
}): Promise<{ documents: ReadDocumentInfo[]; notes: string[] }> {
  const meta = LANDTAGE[parlament];
  const backend = LANDTAG_BACKENDS[parlament]();
  const signal = AbortSignal.timeout(budget.deadlineMs);
  const notes: string[] = [];

  const resolved = await backend.resolveRefs(refs);
  const known = new Set(resolved.map((c) => c.ref));
  const missing = refs.filter((r) => !known.has(r));
  if (missing.length > 0) {
    notes.push(`Nicht gefunden im ${meta.parlament}: ${missing.join(', ')}.`);
  }
  if (resolved.length > budget.maxDocuments) {
    notes.push(
      `Nur die ersten ${budget.maxDocuments} von ${resolved.length} Dokumenten wurden gelesen.`
    );
  }
  const candidates = resolved.slice(0, budget.maxDocuments);
  const docs = await backend.fetchTexts(candidates, { redis: await getRedis(), signal });
  const results = await readDocuments({
    question,
    keywords: keywordsFromQuestion(question),
    auftrag,
    docs,
    budget,
    signal,
    fokus,
    herkunft: meta.herkunft,
  });
  return {
    documents: results.map((r) => ({
      ...toDocumentInfo(r),
      dokumentnummer: r.doc.dokumentnummer,
      datum: r.doc.datum,
      urheber: r.doc.urheber,
      pdfUrl: r.doc.pdfUrl,
      fokusGefunden: r.fokusFound ?? null,
    })),
    notes,
  };
}
