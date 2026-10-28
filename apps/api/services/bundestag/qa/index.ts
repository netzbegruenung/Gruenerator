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
import { CHAT_BUDGET, ENDPOINT_BUDGET, type Budget } from './budget.js';
import { fetchTexts, resolveRefs, type TextCache } from './fetchTexts.js';
import { findCandidates, type FindDip, type FindMcp } from './find.js';
import { keywordsFromQuestion, planFilters } from './plan.js';
import { readDocuments, type ReadResult } from './read.js';

type DocumentInfo = BundestagAnswerResponse['documents'][number];

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
): Promise<{ candidates: BundestagCandidate[]; notes: string[] }> {
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
  return { candidates: resolved.slice(0, budget.maxDocuments), notes };
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
  const results = await readDocuments({ question, keywords, auftrag, docs, budget, signal });
  const msRead = Date.now() - readStart;

  const composed = await composeAnswer({ question, results, filters: usedFilters });
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
  deps,
}: {
  question: string;
  refs: string[];
  auftrag?: BundestagAuftrag;
  budget?: Budget;
  deps?: QaDeps;
}): Promise<{ documents: DocumentInfo[]; notes: string[] }> {
  const { dip, redis } = deps ?? (await defaultDeps());
  const signal = AbortSignal.timeout(budget.deadlineMs);
  const { candidates, notes } = await candidatesForRefs(refs, budget, dip);
  const docs = await fetchTexts(candidates, { dip, redis, signal });
  const results = await readDocuments({
    question,
    keywords: keywordsFromQuestion(question),
    auftrag,
    docs,
    budget,
    signal,
  });
  return { documents: results.map(toDocumentInfo), notes };
}
