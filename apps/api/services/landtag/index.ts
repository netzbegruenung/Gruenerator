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

import { type Deadline } from '../../utils/deadline.js';
import { CHAT_BUDGET, type Budget } from '../bundestag/qa/budget.js';
import { type TextCache } from '../bundestag/qa/fetchTexts.js';
import { type ReadDocumentInfo, toDocumentInfo } from '../bundestag/qa/index.js';
import { keywordsFromQuestion } from '../bundestag/qa/plan.js';
import { readDocuments } from '../bundestag/qa/read.js';

import { LANDTAG_BACKENDS } from './backends.js';
import { type LandtagFindResult } from './berlin/find.js';
import { LANDTAGE, type LandtagMeta } from './registry.js';
import { topicOf } from './wording.js';

export { LANDTAGE, landtageFor, landtagMeta } from './registry.js';
export type { LandtagFindResult } from './berlin/find.js';

async function getRedis(): Promise<TextCache | null> {
  // Erst hier laden: der Import baut die Redis-Verbindung auf.
  const { redisClient } = await import('../../utils/redis/index.js');
  return redisClient as unknown as TextCache;
}

/** „19/2500", „Drucksache 18/21208", „19/S27244" in Suchwort oder Titelfilter. */
const DOC_NUMBER_RE = /(?<![\d/])(\d{1,2})\/S?0*(\d{1,6})(?![\d/])/;

export async function findLandtag(
  parlament: LandtagParlament,
  query: string,
  filters: LandtagFilter,
  deadline: Deadline | null = null
): Promise<LandtagFindResult> {
  const backend = LANDTAG_BACKENDS[parlament]();
  // Eine Nummer sucht die Titelsuche nicht: „19/2500" fand nichts, das Modell las nie
  // und sagte „liegt mir nicht vor" (live 04.11.2026). Erst die Nummer, dann die Suche.
  const nr = DOC_NUMBER_RE.exec(`${query} ${filters.titel ?? ''}`);
  if (nr) {
    const { refPrefix } = LANDTAGE[parlament];
    // Ohne und mit `S` (Berliner Schriftliche Anfragen haben eine eigene Reihe).
    const hits = await backend.resolveRefs([
      `${refPrefix} ${nr[1]}/${nr[2]}`,
      `${refPrefix} ${nr[1]}/S${nr[2]}`,
    ]);
    if (hits.length > 0) {
      return {
        candidates: hits,
        gesamt: hits.length,
        notes: [
          `Gefunden über die Nummer ${nr[1]}/${nr[2]}; für den Inhalt parlament_lesen mit dieser Ref.`,
        ],
      };
    }
  }
  // Filterwörter („Anträge", „Fraktion der Grünen") sind kein Thema; sie stehen schon im Filter.
  return backend.find({ query: topicOf(query), filters, ...(deadline ? { deadline } : {}) });
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
  abortSignal,
}: {
  parlament: LandtagParlament;
  question: string;
  refs: string[];
  auftrag?: BundestagAuftrag;
  budget?: Budget;
  fokus?: string | undefined;
  /** Signal des Werkzeugaufrufs: nach dem Timeout im Loop beginnt kein weiteres Fenster. */
  abortSignal?: AbortSignal;
}): Promise<{ documents: ReadDocumentInfo[]; notes: string[]; nichtGefunden: string[] }> {
  const meta = LANDTAGE[parlament];
  const backend = LANDTAG_BACKENDS[parlament]();
  const deadline = AbortSignal.timeout(budget.deadlineMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, deadline]) : deadline;
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
      fehlgrund: r.doc.fehlgrund ?? null,
    })),
    notes,
    nichtGefunden: missing,
  };
}
