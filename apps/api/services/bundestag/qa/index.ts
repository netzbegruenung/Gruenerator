/**
 * Fassade des Bundestag-Q&A: verkettet plan → find → fetch → read → answer.
 * Der Endpunkt und der Chat rufen nur diese drei Funktionen.
 */
import {
  type BundestagAnswerResponse,
  type BundestagAuftrag,
  type BundestagCandidate,
  type BundestagFilter,
  type BundestagPlanResponse,
} from '@gruenerator/contracts';

import { env } from '../../../config/env.js';
import { getBundestagMCPClient } from '../BundestagMCPClient.js';
import { DipClient } from '../dip/dipClient.js';

import { composeAnswer } from './answer.js';
import { ANSWER_MIN_TIMEOUT_MS, CHAT_BUDGET, ENDPOINT_BUDGET, type Budget } from './budget.js';
import { countBundestag, type CountGroupBy, type CountResult } from './count.js';
import { fetchTexts, resolveRefs, type Fehlgrund, type TextCache } from './fetchTexts.js';
import { findCandidates, type FindDip, type FindMcp, type FindResult } from './find.js';
import { keywordsFromQuestion, planFilters } from './plan.js';
import { readDocuments, type ReadResult } from './read.js';

type DocumentInfo = BundestagAnswerResponse['documents'][number];
export type ReadDocumentInfo = DocumentInfo &
  Pick<BundestagCandidate, 'dokumentnummer' | 'datum' | 'urheber' | 'pdfUrl'> & {
    /** Nur mit `fokus`: stand der Anker im Dokument? Sonst `null`. */
    fokusGefunden: boolean | null;
    /** Genauer Grund, wenn der Text fehlt (Seitenbereich, unveröffentlicht, Abruf). */
    fehlgrund: Fehlgrund | null;
  };

/** Austauschbare Außenwelt; Produktion nimmt die Singletons. */
export interface QaDeps {
  dip: FindDip;
  mcp: FindMcp;
  redis: TextCache | null;
}

let dipSingleton: DipClient | null = null;

/** Ein Client für alle Anfragen: nur so gilt der Takt (`pacingMs`) prozessweit. */
function getDip(): DipClient {
  if (!dipSingleton) {
    if (!env.DIP_API_KEY) throw new Error('DIP_API_KEY is not set');
    dipSingleton = new DipClient(env.DIP_API_KEY, {
      timeoutMs: 20_000,
      maxAttempts: 2,
      pacingMs: 250,
      rateLimitCooldownMs: 5_000,
    });
  }
  return dipSingleton;
}

async function getRedis(): Promise<TextCache | null> {
  // Erst hier laden: der Import baut die Redis-Verbindung auf.
  const { redisClient } = await import('../../../utils/redis/index.js');
  return redisClient as unknown as TextCache;
}

async function defaultDeps(): Promise<QaDeps> {
  return {
    dip: getDip(),
    mcp: getBundestagMCPClient() as unknown as FindMcp,
    redis: await getRedis(),
  };
}

/** Nur für Tests: setzt den Singleton zurück. */
export function resetDipForTests(): void {
  dipSingleton = null;
}

export function toDocumentInfo(r: ReadResult): DocumentInfo {
  return {
    ref: r.doc.ref,
    drucksachetyp: r.doc.drucksachetyp,
    titel: r.doc.titel,
    textSource: r.doc.textSource,
    relevant: r.relevant,
    points: r.points,
    droppedPoints: r.droppedPoints,
    windowsRead: r.windowsRead,
    windowsTotal: r.windowsTotal,
    skipped: r.skipped,
  };
}

async function candidatesForRefs(
  refs: readonly string[],
  budget: Budget,
  dip: FindDip
): Promise<{ candidates: BundestagCandidate[]; notes: string[]; missing: string[] }> {
  const notes: string[] = [];
  const resolved = await resolveRefs(refs, dip);
  const known = new Set(resolved.map((c) => c.ref));
  const missing = refs.filter((r) => !known.has(r));
  if (missing.length > 0) notes.push(`Nicht gefunden bei DIP: ${missing.join(', ')}.`);
  if (resolved.length > budget.maxDocuments) {
    notes.push(
      `Nur die ersten ${budget.maxDocuments} von ${resolved.length} Dokumenten wurden gelesen.`
    );
  }
  return { candidates: resolved.slice(0, budget.maxDocuments), notes, missing };
}

export async function planBundestagQuestion({
  question,
  filters,
  budget = ENDPOINT_BUDGET,
  deps,
}: {
  question: string;
  filters?: BundestagFilter;
  budget?: Budget;
  deps?: QaDeps;
}): Promise<BundestagPlanResponse> {
  const { dip, mcp } = deps ?? (await defaultDeps());
  const plan = await planFilters({ question, explicit: filters ?? {}, dip });
  const found = await findCandidates({
    question,
    filters: plan.filters,
    assumedWahlperiode: plan.assumedWahlperiode,
    budget,
    dip,
    mcp,
  });
  return {
    filters: plan.filters,
    keywords: plan.keywords,
    notes: [...plan.notes, ...found.notes],
    totals: found.totals,
    candidates: found.candidates,
  };
}

export async function answerBundestagQuestion({
  question,
  filters,
  refs,
  auftrag = 'frage',
  budget = ENDPOINT_BUDGET,
  deps,
}: {
  question: string;
  filters?: BundestagFilter;
  refs?: string[];
  auftrag?: BundestagAuftrag;
  budget?: Budget;
  deps?: QaDeps;
}): Promise<BundestagAnswerResponse> {
  const startedAt = Date.now();
  const { dip, mcp, redis } = deps ?? (await defaultDeps());
  const deadlineAt = startedAt + budget.deadlineMs;
  const signal = AbortSignal.timeout(budget.deadlineMs);

  let usedFilters: BundestagFilter;
  let keywords: string[];
  let candidates: BundestagCandidate[];
  let notes: string[];
  if (refs && refs.length > 0) {
    // Refs haben Vorrang: kein Plan-Aufruf, die Filter laufen nur durch.
    usedFilters = filters ?? {};
    const hasFilters = Object.values(usedFilters).some((v) => v !== undefined);
    keywords = keywordsFromQuestion(question);
    ({ candidates, notes } = await candidatesForRefs(refs, budget, dip));
    if (hasFilters) notes.push('Die Filter wurden auf die angegebenen Dokumente nicht angewendet.');
  } else {
    const plan = await planBundestagQuestion({
      question,
      ...(filters ? { filters } : {}),
      budget,
      deps: { dip, mcp, redis },
    });
    usedFilters = plan.filters;
    keywords = plan.keywords;
    candidates = plan.candidates;
    notes = plan.notes;
  }

  const docs = await fetchTexts(candidates, { dip, redis, signal });
  const readStart = Date.now();
  const results = await readDocuments({
    question,
    keywords,
    auftrag,
    docs,
    budget,
    signal,
    deadlineAt,
  });
  const msRead = Date.now() - readStart;

  // Die Antwort bekommt, was von der Frist übrig ist, mindestens aber genug für einen Aufruf.
  const composed = await composeAnswer({
    question,
    results,
    filters: usedFilters,
    timeoutMs: Math.max(ANSWER_MIN_TIMEOUT_MS, deadlineAt - Date.now()),
  });
  if (composed.capped > 0) {
    notes = [
      ...notes,
      `${composed.capped} weitere belegte Punkte wurden für die Antwort nicht berücksichtigt (Obergrenze).`,
    ];
  }

  return {
    answer: composed.answer,
    citations: composed.citations,
    documents: results.map(toDocumentInfo),
    filters: usedFilters,
    notes,
    stats: {
      msTotal: Date.now() - startedAt,
      msRead,
      charsRead: results.reduce((n, r) => n + r.charsRead, 0),
      pointsVerified: results.reduce((n, r) => n + r.points.length, 0),
      pointsDropped: results.reduce((n, r) => n + r.droppedPoints, 0),
      invalidCitations: composed.invalidCitations,
    },
  };
}

/** Liest genau diese Refs, ohne Antworttext (Chat-Werkzeug `parlament_lesen`). */
export async function readBundestagRefs({
  question,
  refs,
  auftrag = 'frage',
  budget = CHAT_BUDGET,
  fokus,
  abortSignal,
  deps,
}: {
  question: string;
  refs: string[];
  auftrag?: BundestagAuftrag;
  budget?: Budget;
  /** Abschnitt/Artikel/Paragraf, auf den sich das Lesen richtet. */
  fokus?: string;
  /** Signal des Werkzeugaufrufs: nach dem Timeout im Loop beginnt kein weiteres Fenster. */
  abortSignal?: AbortSignal;
  deps?: QaDeps;
}): Promise<{ documents: ReadDocumentInfo[]; notes: string[]; nichtGefunden: string[] }> {
  const { dip, redis } = deps ?? (await defaultDeps());
  const deadline = AbortSignal.timeout(budget.deadlineMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, deadline]) : deadline;
  const { candidates, notes, missing } = await candidatesForRefs(refs, budget, dip);
  const docs = await fetchTexts(candidates, { dip, redis, signal });
  const results = await readDocuments({
    question,
    keywords: keywordsFromQuestion(question),
    auftrag,
    docs,
    budget,
    signal,
    ...(fokus ? { fokus } : {}),
  });
  // Der Chat braucht für Titel und Link mehr als der Endpunkt: Nummer, Datum, Urheber, PDF.
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

/** Zählt Drucksachen (bzw. Vorgänge) für die Filter, optional gruppiert (Chat-Werkzeug `bundestag`, modus 'zaehlen'). */
export async function countBundestagDocs(args: {
  filters: BundestagFilter;
  gruppieren?: CountGroupBy;
  deps?: Pick<QaDeps, 'dip'>;
}): Promise<CountResult> {
  const dip = args.deps?.dip ?? getDip();
  return countBundestag({
    filters: args.filters,
    ...(args.gruppieren ? { gruppieren: args.gruppieren } : {}),
    dip,
  });
}

/** Mehr als die 6 der Liste: eine Gesetzgebungs-Familie hat Entwurf, Beschlussempfehlung, Lesungen, Bundesrat. */
const FAMILY_MAX_DOCUMENTS = 15;

/**
 * Alle Dokumente des Vorgangs, zu dem die Drucksache `ref` gehört (samt
 * Beratungsabschnitten und Beratungsverlauf). Nur Drucksachen-Refs: für ein
 * Plenarprotokoll gibt es bei DIP keinen Weg vom Protokoll zum Vorgang ohne Suche.
 */
export async function bundestagFamily(
  ref: string,
  deps?: Pick<QaDeps, 'dip' | 'mcp'>
): Promise<FindResult & { filters: BundestagFilter }> {
  const { dip, mcp } = deps ?? (await defaultDeps());
  const wahlperiode = Number(ref.split('/')[0]);
  const filters: BundestagFilter = {
    dokumentnummer: [ref],
    mitBeratung: true,
    wahlperiode: [wahlperiode],
  };
  const found = await findCandidates({
    question: ref,
    filters,
    assumedWahlperiode: false,
    budget: { ...CHAT_BUDGET, maxDocuments: FAMILY_MAX_DOCUMENTS },
    dip,
    mcp,
  });
  return { ...found, filters };
}
