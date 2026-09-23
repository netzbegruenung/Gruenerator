/**
 * `notebook_quellen` gegen die ECHTE Qdrant — das Berlin-Notebook (~1.500
 * Quellen) als Prüfstand für die Fragen, mit denen das Werkzeug am 23.09.2026
 * auf dem Testserver durchfiel. Kein Modell: jede Frage ist hier der
 * Werkzeugaufruf, den ein Planer dafür absetzen sollte, und geprüft wird, was
 * das Werkzeug zurückgibt. Die Fakes in `notebookSourceTools.system.vitest.ts`
 * sahen keinen der Fehler — sie kannten weder 1.500 Quellen noch Titel mit
 * `&nbsp;`, und sie filterten, was die echte Sammlung nicht filtert.
 *
 * Läuft NUR mit `NOTEBOOK_LIVE=1` (`pnpm --filter @gruenerator/api
 * test:notebook-live`): die vitest-Konfiguration lädt `.env`, ein normales
 * `pnpm test` erreichte sonst die Produktions-Qdrant. `find`/`rank relevance`
 * brauchen zusätzlich den Embedding-Schlüssel aus `.env`.
 *
 * Zusicherungen sind Invarianten, keine Zählstände: die Sammlung wächst
 * stündlich. Was eine feste Zahl braucht (das Wahlprogramm hat sieben Teile),
 * steht als Untergrenze da.
 */
import { describe, expect, it } from 'vitest';

import { resolveSystemCollection } from '../../../services/notebook/systemNotebookSources.js';
import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeNotebookSourcesTool } from './notebookSourceTools.js';
import { collectionsForLocale } from './searchTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const LIVE = process.env.NOTEBOOK_LIVE === '1';
const TIMEOUT = 60_000;
const NOTEBOOK = 'berlin';

type Result = Record<string, any>;

function makeTool(opts: { recentSteps?: PersistedStep[] } = {}) {
  const state = {
    agentConfig: { userId: 'live-test' },
    userLocale: 'de-DE',
    messages: [],
    notebookIds: [],
  } as unknown as ChatGraphState;
  const tool = makeNotebookSourcesTool({
    state,
    sse: { send: () => {} } as unknown as SSEWriter,
    threadId: 'live-thread',
    sourceRegistry: createSourceRegistry(),
    deps: { recentSteps: async () => opts.recentSteps ?? [] },
  });
  return async (args: Record<string, unknown>): Promise<Result> =>
    ((await (tool.execute as (a: unknown, o: unknown) => Promise<Result>)(
      { mode: 'hybrid', rerank: false, ...args },
      {}
    )) ?? {}) as Result;
}

const day = (r: Result): string | null =>
  typeof r.snippet === 'string' ? (/\d{4}-\d{2}-\d{2}/.exec(r.snippet)?.[0] ?? null) : null;

describe.runIf(LIVE)('notebook_quellen live — Berlin', () => {
  it('resolves berlin as a system notebook for de-DE', () => {
    const r = resolveSystemCollection(NOTEBOOK, collectionsForLocale('de-DE'));
    expect(r && 'collection' in r ? r.collection.key : r).toBe(NOTEBOOK);
  });

  it(
    'Q1 „die 20 neuesten Quellen aus 2026" — only 2026, newest first',
    async () => {
      const out = await makeTool()({
        action: 'list',
        notebookId: NOTEBOOK,
        sortBy: 'date',
        filter: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
        limit: 20,
      });
      expect(out.error).toBeUndefined();
      expect(out.results).toHaveLength(20);
      const days = (out.results as Result[]).map(day);
      expect(days.every((d) => d !== null && d.startsWith('2026'))).toBe(true);
      expect([...days].sort().reverse()).toEqual(days);
      expect(out.filter).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    },
    TIMEOUT
  );

  it(
    'Q2 „Quellen mit Wahlprogramm im Titel" — nested, flat and as query',
    async () => {
      const run = makeTool();
      const shapes = [
        { filter: { titleContains: 'Wahlprogramm' } },
        { titleContains: 'Wahlprogramm' },
        { query: 'Wahlprogramm' },
      ];
      for (const shape of shapes) {
        const out = await run({ action: 'list', notebookId: NOTEBOOK, limit: 50, ...shape });
        expect(out.error, JSON.stringify(shape)).toBeUndefined();
        for (const r of out.results as Result[]) {
          expect(String(r.title).toLowerCase(), JSON.stringify(shape)).toContain('wahlprogramm');
        }
        expect(out.total, JSON.stringify(shape)).toBeGreaterThanOrEqual(7);
        expect(out.filter).toEqual({ titleContains: 'Wahlprogramm' });
      }
    },
    TIMEOUT
  );

  it(
    'Q2b list names the categories, and category=wahlprogramm finds the chapters',
    async () => {
      const run = makeTool();
      const all = await run({ action: 'list', notebookId: NOTEBOOK, limit: 1 });
      expect(Object.keys(all.categories as object)).toContain('wahlprogramm');
      const out = await run({
        action: 'list',
        notebookId: NOTEBOOK,
        filter: { category: 'wahlprogramm' },
        limit: 50,
      });
      expect(out.total).toBeGreaterThanOrEqual(7);
    },
    TIMEOUT
  );

  it(
    'Q3 „öffne das Wahlprogramm" with a guessed URL — suggestions, then the real ref opens',
    async () => {
      const run = makeTool();
      const miss = await run({
        action: 'outline',
        notebookId: NOTEBOOK,
        sourceId: 'https://gruene.berlin/wahlprogramm-2026',
      });
      expect(miss.error).toMatch(/Meintest du/);
      const refs = (miss.suggestions as Array<{ ref: string }>).map((s) => s.ref);
      expect(refs.some((ref) => ref.includes('wahlprogramm'))).toBe(true);

      const read = await run({
        action: 'read',
        notebookId: NOTEBOOK,
        sourceId: refs.find((ref) => ref.includes('wahlprogramm')),
      });
      expect(read.error).toBeUndefined();
      expect(String(read.text).length).toBeGreaterThan(200);
    },
    TIMEOUT
  );

  it(
    'Q4 „fünf Stellen zur Verkehrswende" without notebookId — the thread notebook is used',
    async () => {
      const previous: PersistedStep = {
        toolCallId: 'c1',
        toolName: 'notebook_quellen',
        args: { action: 'list', notebookId: NOTEBOOK },
        result: {},
      };
      const out = await makeTool({ recentSteps: [previous] })({
        action: 'find',
        query: 'Verkehrswende',
        limit: 5,
      });
      expect(out.error).toBeUndefined();
      expect(out.collection).toBe(NOTEBOOK);
      expect(out.notebookFrom).toMatch(/zuletzt/);
      expect(out.passages).toHaveLength(5);
    },
    TIMEOUT
  );

  it(
    'Q5 „10 relevanteste Quellen aus 2025 zu Klimaneutralität" — only 2025 sources',
    async () => {
      const run = makeTool();
      const filter = { dateFrom: '2025-01-01', dateTo: '2025-12-31' };
      const ranked = await run({
        action: 'rank',
        notebookId: NOTEBOOK,
        by: 'relevance',
        query: 'Klimaneutralität',
        filter,
        limit: 10,
      });
      expect(ranked.error).toBeUndefined();
      const ranking = ranked.ranking as Array<{ sourceId: string }>;
      expect(ranking.length).toBeGreaterThan(0);

      const in2025 = new Set<string>();
      for (let offset = 0; ; offset += 50) {
        const page = await run({ action: 'list', notebookId: NOTEBOOK, filter, offset, limit: 50 });
        for (const r of page.results as Result[]) in2025.add(String(r.ref));
        if (offset + 50 >= (page.total as number)) break;
      }
      for (const r of ranking) expect(in2025.has(r.sourceId), r.sourceId).toBe(true);
      expect(ranked.filter).toEqual(filter);
    },
    TIMEOUT * 2
  );

  it(
    'Q6 „wie oft kommt Klimaschutz vor" — counts, and says when it did not read everything',
    async () => {
      const run = makeTool();
      const whole = await run({ action: 'grep', notebookId: NOTEBOOK, phrase: 'Klimaschutz' });
      expect(whole.error).toBeUndefined();
      expect(whole.totalHits).toBeGreaterThan(0);
      // ~1.500 Quellen > SYSTEM_SCAN_MAX_SOURCES: nur ein Teil gelesen.
      expect(whole.exhaustive).toBe(false);
      expect(whole.note).toBeTruthy();

      const program = await run({
        action: 'grep',
        notebookId: NOTEBOOK,
        phrase: 'Klimaschutz',
        filter: { category: 'wahlprogramm' },
      });
      expect(program.exhaustive).toBe(true);
      expect(program.sourcesScanned).toBeGreaterThanOrEqual(7);
    },
    TIMEOUT * 2
  );
});
