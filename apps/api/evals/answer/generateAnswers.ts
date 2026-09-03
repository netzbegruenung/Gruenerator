/**
 * Answer generator for the reranker answer-eval — runs the 34 cases from
 * `answerCases.ts` through the PRODUCTION notebook stream
 * (`handleNotebookStream`), once per variant in `VARIANT_RERANK`
 * (`none`/`today`/`filter`), and records the answer each variant produced.
 *
 *   pnpm --filter @gruenerator/api eval:answer:generate
 *
 * Real services throughout: `notebookQAService`, `rerankNotebookResults`,
 * `resolveModel`, the streaming model call — nothing here is mocked. Only the
 * Express req/res/sse triple is a stand-in (copied from
 * `routes/chat/notebookStreamCore.vitest.ts`'s `makeReqRes`), because
 * `handleNotebookStream` writes to it instead of returning the answer for the
 * paths that matter here: on the quality-gate and no-results branches it sends
 * a `completion` event and then returns `null` — the RETURNED
 * `NotebookStreamResult` is null there, but a real answer (the rejection
 * message) still went out over the wire. Reading the last `completion` event
 * is therefore the only way to get the answer on every path; the function's
 * return value is not used at all.
 *
 * Two of the nine `notebook` cases (`notebook-user-ausschreibungen`,
 * `notebook-user-haushaltsplan`) carry a SYNTHETIC `notebook.user` stub — the
 * retrieval eval's `runNotebookCase` injects `getCollectionFn`/
 * `getDocumentIdsFn` to fake a notebook collection that no real DB row backs
 * (`collectionId: '00000000-0000-4000-8000-0000000000a1'`, see cases.ts).
 * `handleNotebookStream` has no such injection seam — its `getCollectionFn`
 * always calls the real `NotebookQdrantHelper` — so these two cases cannot be
 * exercised through the production stream and are skipped here with a
 * warning. They still count toward the 34 in `answerCases.ts` and the
 * retrieval eval, which is why generation runs 32 cases, not 34.
 *
 * `evidenceTop` (the dense pre-rerank ceiling) never crosses the SSE
 * boundary — notebookStreamCore.ts computes it but deliberately keeps the
 * number off the wire (only a weak/ok warning may fire). It is the same value
 * for all three variants of a case (rerank runs AFTER `getSearchContext`), so
 * it is fetched once per case via a direct `getSearchContext` call that
 * mirrors `runNotebookCase`'s query construction, and reused across variants.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

// Load .env BEFORE any app module: those import config/env.js at module scope,
// so a static import above this line would read an empty environment (see
// runRetrievalEval.ts for the same constraint).
dotenv.config();

const { handleNotebookStream } = await import('../../routes/chat/notebookStreamCore.js');
const { notebookQAService } = await import('../../services/notebook/index.js');
const { getNotebookDepthProfile } = await import('../../config/notebookDepthProfiles.js');
const { expandQuery } = await import('../../services/search/QueryExpansionService.js');
const { normalizeNotebookHistory, buildRewriteTranscript } =
  await import('../../routes/chat/services/notebookHistoryService.js');

import { ANSWER_CASES, type AnswerCase } from './answerCases.js';
import {
  ANSWER_VARIANTS,
  VARIANT_RERANK,
  answerKey,
  shuffleVariants,
  today,
  type AnswerCitation,
  type AnswerRecord,
  type AnswerVariant,
} from './answerEvalCore.js';

import type { NotebookStreamOptions } from '../../routes/chat/notebookStreamCore.js';
import type { NotebookDepth } from '@gruenerator/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The tier the whole answer-eval measures — matches the brief. */
const DEPTH: NotebookDepth = 'deep';
const CONCURRENCY = 2;

type Messages = NotebookStreamOptions['messages'];
type Sse = NonNullable<NotebookStreamOptions['sse']>;

interface CollectedEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Express req/res/sse doubles — `handleNotebookStream` only writes to them. */
function makeReqRes(): {
  req: NotebookStreamOptions['req'];
  res: NotebookStreamOptions['res'];
  sse: Sse;
  sent: CollectedEvent[];
} {
  const sent: CollectedEvent[] = [];
  const req = { on: () => {} } as unknown as NotebookStreamOptions['req'];
  const res = {
    headersSent: true,
    write: () => {},
    end: () => {},
    setHeader: () => {},
    flushHeaders: () => {},
  } as unknown as NotebookStreamOptions['res'];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => {
      sent.push({ event, data });
    },
    end: () => {},
    isEnded: () => false,
  } as unknown as Sse;
  return { req, res, sse, sent };
}

/** The wire shape of one `Citation` (services/search/types.ts), read defensively —
 *  it crosses the SSE boundary as `unknown[]`. */
function toAnswerCitations(raw: readonly unknown[]): AnswerCitation[] {
  return raw.map((entry) => {
    const c = (entry ?? {}) as { document_title?: unknown; source_url?: unknown };
    return {
      title: typeof c.document_title === 'string' ? c.document_title : '',
      url: typeof c.source_url === 'string' ? c.source_url : null,
    };
  });
}

/**
 * Mirrors `runNotebookCase`'s query construction (runRetrievalEval.ts) and
 * `handleNotebookStream`'s (notebookStreamCore.ts) closely enough to read the
 * same `evidenceTop` a real stream call would have computed — keep in sync if
 * either changes. Only called for the two, never for user-stub cases (see
 * header).
 */
async function computeEvidenceTop(c: AnswerCase, depth: NotebookDepth): Promise<number | null> {
  const meta = c.notebook;
  const profile = getNotebookDepthProfile(depth);
  const incomingHistory = normalizeNotebookHistory(meta.history ?? []);
  let queries = [c.question];
  const wantsRewrite = profile.queryRewrite && incomingHistory.length > 0;
  if (wantsRewrite || profile.queryVariants > 1) {
    const expanded = await expandQuery(
      c.question,
      wantsRewrite
        ? {
            historyContext: buildRewriteTranscript(incomingHistory),
            ...(profile.queryVariants <= 1 && { variants: 0 }),
          }
        : {}
    );
    queries = [expanded.primary, ...expanded.alternatives].slice(
      0,
      Math.max(1, profile.queryVariants)
    );
  }

  const ctx = await notebookQAService.getSearchContext({
    question: c.question,
    ...(meta.collectionId && { collectionId: meta.collectionId }),
    ...(meta.collectionIds && { collectionIds: meta.collectionIds }),
    userId: 'SYSTEM',
    depth,
    queries,
  });
  return ctx?.evidenceTop ?? null;
}

async function runOne(
  c: AnswerCase,
  variant: AnswerVariant,
  evidenceTop: number | null
): Promise<AnswerRecord | null> {
  const meta = c.notebook;
  const messages: Messages = [
    ...(meta.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: c.question },
  ] as Messages;

  const { req, res, sse, sent } = makeReqRes();
  const t0 = Date.now();
  try {
    await handleNotebookStream({
      req,
      res,
      sse,
      messages,
      ...(meta.collectionId && { collectionId: meta.collectionId }),
      ...(meta.collectionIds && { collectionIds: meta.collectionIds }),
      userId: 'SYSTEM',
      mode: DEPTH,
      rerank: VARIANT_RERANK[variant],
      closeStream: false,
    });
  } catch (error) {
    console.error(`[${c.id}::${variant}] handleNotebookStream threw:`, error);
    return null;
  }
  const durationMs = Date.now() - t0;

  const completionEvent = [...sent].reverse().find((e) => e.event === 'completion');
  if (!completionEvent) {
    console.warn(`[${c.id}::${variant}] no completion event (error path) — leaving unresolved`);
    return null;
  }
  const answer = typeof completionEvent.data.answer === 'string' ? completionEvent.data.answer : '';
  const rawCitations = Array.isArray(completionEvent.data.citations)
    ? completionEvent.data.citations
    : [];

  return {
    caseId: c.id,
    variant,
    question: c.question,
    answer,
    citations: toAnswerCitations(rawCitations),
    durationMs,
    evidenceTop,
  };
}

function loadExisting(path: string): AnswerRecord[] {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AnswerRecord[];
  } catch {
    return [];
  }
}

function persist(path: string, records: readonly AnswerRecord[]): void {
  const caseOrder = new Map(ANSWER_CASES.map((c, i) => [c.id, i]));
  const variantOrder = new Map(ANSWER_VARIANTS.map((v, i) => [v, i]));
  const sorted = [...records].sort((a, b) => {
    const ai = caseOrder.get(a.caseId) ?? 0;
    const bi = caseOrder.get(b.caseId) ?? 0;
    if (ai !== bi) return ai - bi;
    return (variantOrder.get(a.variant) ?? 0) - (variantOrder.get(b.variant) ?? 0);
  });
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

interface WorkItem {
  c: AnswerCase;
  variant: AnswerVariant;
}

async function main(): Promise<void> {
  const outPath = join(HERE, `answers-${today()}.json`);
  const existing = loadExisting(outPath);
  const alreadyDone = new Set(existing.map((r) => answerKey(r.caseId, r.variant)));

  const runnable = ANSWER_CASES.filter((c) => c.notebook.user == null);
  const skipped = ANSWER_CASES.filter((c) => c.notebook.user != null);
  if (skipped.length > 0) {
    console.warn(
      `Skipping ${skipped.length} case(s) with a synthetic user-notebook stub ` +
        `handleNotebookStream cannot resolve (no real DB row, no injection seam): ` +
        `${skipped.map((c) => c.id).join(', ')}`
    );
  }

  // evidenceTop is per-CASE, not per-variant — reuse it from an already
  // written record when one exists, so a resumed run does not re-search.
  const evidenceByCase = new Map<string, number | null>(
    existing.map((r) => [r.caseId, r.evidenceTop])
  );
  const needEvidence = runnable.filter((c) => !evidenceByCase.has(c.id));
  if (needEvidence.length > 0) {
    console.log(`Computing evidenceTop for ${needEvidence.length} case(s)…`);
    let evCursor = 0;
    async function evidenceWorker(): Promise<void> {
      while (evCursor < needEvidence.length) {
        const c = needEvidence[evCursor++];
        if (!c) continue;
        evidenceByCase.set(c.id, await computeEvidenceTop(c, DEPTH));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, needEvidence.length) }, () => evidenceWorker())
    );
  }

  const work: WorkItem[] = [];
  for (const c of runnable) {
    // Randomised per case so three variants of the SAME case never line up
    // with the same clock position across the whole run.
    const order = shuffleVariants(Math.random);
    for (const variant of order) {
      if (alreadyDone.has(answerKey(c.id, variant))) continue;
      work.push({ c, variant });
    }
  }

  console.log(`Running ${work.length} case×variant pair(s) (concurrency=${CONCURRENCY})…`);
  const results: AnswerRecord[] = [...existing];
  let cursor = 0;
  let doneCount = 0;
  const total = work.length;

  async function worker(): Promise<void> {
    while (cursor < work.length) {
      const item = work[cursor++];
      if (!item) continue;
      const evidenceTop = evidenceByCase.get(item.c.id) ?? null;
      const record = await runOne(item.c, item.variant, evidenceTop);
      doneCount++;
      if (record) {
        results.push(record);
        persist(outPath, results);
        console.log(
          `[${doneCount}/${total}] ${item.c.id}::${item.variant} (${record.durationMs}ms)`
        );
      } else {
        console.log(
          `[${doneCount}/${total}] ${item.c.id}::${item.variant} FAILED — left for a retry`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
  console.log(`Done. Wrote ${outPath}`);
}

main().catch((error) => {
  console.error('generateAnswers failed:', error);
  process.exit(1);
});
