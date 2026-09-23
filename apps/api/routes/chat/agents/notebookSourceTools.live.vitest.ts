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
import { describe, expect, it, vi } from 'vitest';

// Nur lesen: ohne das gleicht `init()` Sammlungen und Indizes der Produktion ab
// (#3167). Gehoben, weil schon die Importe unten den Qdrant-Singleton starten.
await vi.hoisted(async () => {
  if (process.env.NOTEBOOK_LIVE !== '1') return;
  const qdrant = await import('../../../database/services/QdrantService/index.js');
  qdrant.useQdrantConnectOnly();
});

import { applyDefaultFilter } from '../../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { grepText } from '../../../services/notebook/sourceGrep.js';
import {
  resolveSystemCollection,
  systemTermQuery,
} from '../../../services/notebook/systemNotebookSources.js';
import { buildToolObservationReplay } from '../services/agenticLoop/mcpReplay.js';
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

/** Alle Punkte unter `filter`, nur lesend — für den Abgleich Index gegen Zähler. */
async function scrollAll(
  filter: Record<string, unknown>,
  payload: string[]
): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.client) throw new Error('Qdrant not available');
  const out: Array<{ id: string | number; payload: Record<string, unknown> }> = [];
  let offset: string | number | null = null;
  do {
    const page = await qdrant.client.scroll('landesverbaende_documents', {
      filter,
      limit: 1000,
      with_payload: payload,
      with_vector: false,
      ...(offset !== null ? { offset } : {}),
    });
    for (const p of page.points) {
      out.push({ id: p.id, payload: (p.payload as Record<string, unknown> | null) ?? {} });
    }
    const next = page.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
  } while (offset !== null);
  return out;
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
    'Q6 „wie oft kommt Klimaschutz vor" — an exact count over all ~1.500 sources',
    async () => {
      const run = makeTool();
      const whole = await run({ action: 'grep', notebookId: NOTEBOOK, phrase: 'Klimaschutz' });
      expect(whole.error).toBeUndefined();
      // Über den Volltextindex: alle Quellen, nicht die ersten 200.
      expect(whole.exhaustive).toBe(true);
      expect(whole.note).toBeUndefined();
      // 23.09.2026: 193 Quellen — Untergrenze, die Sammlung wächst.
      expect(whole.sourcesWithHits).toBeGreaterThan(150);
      expect(whole.totalHits).toBeGreaterThanOrEqual(whole.sourcesWithHits);
      // Durchsucht sind alle Quellen, nicht nur die mit Treffer.
      expect(whole.sourcesScanned).toBeGreaterThan(1000);
      expect(whole.countRule).toMatch(/Groß\/klein/);

      const ranked = await run({
        action: 'rank',
        notebookId: NOTEBOOK,
        by: 'term',
        query: 'Klimaschutz',
        limit: 5,
      });
      expect(ranked.exhaustive).toBe(true);
      expect(ranked.ranking[0].value).toBe(whole.perSource[0].count);
      console.log(
        `[Q6] Klimaschutz: ${whole.totalHits} hits in ${whole.sourcesWithHits} sources (${whole.sourcesScanned} read)`
      );

      const program = await run({
        action: 'grep',
        notebookId: NOTEBOOK,
        phrase: 'Klimaschutz',
        filter: { category: 'wahlprogramm' },
      });
      // 7 Quellen: ganz gelesen, mit voller Faltung — kein Index, keine Zählregel.
      expect(program.exhaustive).toBe(true);
      expect(program.sourcesScanned).toBeGreaterThanOrEqual(7);
      expect(program.countRule).toBeUndefined();
    },
    TIMEOUT * 2
  );

  // Die Zusicherung hinter `exhaustive: true`: jeder Chunk, in dem der Zähler
  // einen Treffer zählt, kommt aus dem Index zurück. Geprüft gegen ALLE
  // Berliner Chunks, mit Wörtern, die den Tokenizer fordern: Umlaute (auch
  // zerlegt im Text), Bindestrich-Komposita, Ziffern, Wortfolgen.
  it(
    'Q6b the chunk_text index returns every chunk the counter counts',
    async () => {
      const r = resolveSystemCollection(NOTEBOOK, collectionsForLocale('de-DE'));
      if (!r || 'error' in r) throw new Error('berlin not resolved');
      const all = await scrollAll(
        applyDefaultFilter(r.collection.systemId) as Record<string, unknown>,
        ['chunk_text']
      );
      expect(all.length).toBeGreaterThan(5000);
      const phrases = [
        'Klimaschutz',
        'Klimaschutzgesetz',
        'Klimaneutralität',
        'Wärmepumpe',
        'künftig',
        'Verkehrswende',
        'Radverkehr',
        'E-Auto',
        'CO2',
        'CO₂',
        'sozialer Wohnungsbau',
        'Charité',
        // Bekannte Grenze: ein Akzent außer Groß/klein, den die Phrase nicht
        // trägt, zählt nicht — „Charite" findet „Charité" nicht (der Index
        // faltet keine Akzente). Die Zahl bleibt trotzdem vollständig für das,
        // was sie zählt; „narrowed" misst, was der Zähler allein mehr fände.
        'Charite',
        'Mietendeckel',
      ];
      const report: string[] = [];
      for (const phrase of phrases) {
        const query = systemTermQuery(r.collection, phrase);
        if (!query) throw new Error(`no index query for ${phrase}`);
        const index = new Set(
          (await scrollAll(query.filter as Record<string, unknown>, [])).map((p) => String(p.id))
        );
        const counted = all.filter(
          (p) =>
            grepText(String(p.payload.chunk_text ?? ''), phrase, { accept: query.accept }).count > 0
        );
        const narrowed = all.filter(
          (p) =>
            grepText(String(p.payload.chunk_text ?? ''), phrase, {}).count > 0 &&
            !counted.includes(p)
        );
        const missing = counted.filter((p) => !index.has(String(p.id)));
        report.push(
          `${phrase}: counter ${counted.length} chunks, index ${index.size}, missing ${missing.length}, only-without-accept ${narrowed.length}`
        );
        expect(
          missing.map((p) => p.id),
          phrase
        ).toEqual([]);
        // Was der Zähler ohne `accept` mehr zählte, fehlte der Antwort still.
        if (phrase === 'Charite') expect(narrowed.length).toBeGreaterThan(0);
        else expect(narrowed.length, phrase).toBe(0);
      }
      console.log(`[Q6b] ${all.length} Berlin chunks\n${report.join('\n')}`);
    },
    TIMEOUT * 4
  );

  it(
    'Q6c every reachable system collection has the verified chunk_text index',
    async () => {
      const qdrant = getQdrantInstance();
      await qdrant.init();
      if (!qdrant.client) throw new Error('Qdrant not available');
      const names = new Set<string>();
      for (const locale of ['de-DE', 'de-AT'] as const) {
        for (const key of collectionsForLocale(locale)) {
          const r = resolveSystemCollection(key, collectionsForLocale(locale));
          if (r && 'collection' in r) names.add(r.collection.qdrantCollection);
        }
      }
      const report: string[] = [];
      for (const name of names) {
        const schema = (await qdrant.client.getCollection(name)).payload_schema ?? {};
        const params = (schema.chunk_text as { params?: unknown } | undefined)?.params;
        report.push(`${name}: ${JSON.stringify(params)}`);
        expect(params, name).toEqual({
          type: 'text',
          tokenizer: 'word',
          min_token_len: 2,
          max_token_len: 50,
          lowercase: true,
        });
      }
      console.log(`[Q6c]\n${report.join('\n')}`);
    },
    TIMEOUT
  );

  it(
    'Q7 a date filter says how many undated sources it left out',
    async () => {
      const run = makeTool();
      const out = await run({
        action: 'list',
        notebookId: NOTEBOOK,
        filter: { dateFrom: '2000-01-01' },
        limit: 1,
      });
      // 23.09.2026: 326 von 1.547 Berliner Quellen ohne published_at. Die
      // Zahl sinkt, sobald der Scraper Daten nachträgt — invariant ist die Summe.
      const all = await run({ action: 'list', notebookId: NOTEBOOK, limit: 1 });
      expect(out.total + (out.undatedExcluded ?? 0)).toBe(all.total);
      if (out.undatedExcluded) expect(out.note).toMatch(/ohne Datum/);
    },
    TIMEOUT
  );

  it(
    'Q8 a 20-row list keeps every ref in the replay of a later turn (#3561)',
    async () => {
      const args = { action: 'list', notebookId: NOTEBOOK, sortBy: 'date', limit: 20 };
      const result = await makeTool()(args);
      expect(result.results).toHaveLength(20);
      const replay = buildToolObservationReplay(
        [{ toolCallId: 'c1', toolName: 'notebook_quellen', args, result }],
        new Set(['notebook_quellen'])
      );
      const value = (replay[1]!.content as Array<{ output: { value: string } }>)[0]!.output.value;
      expect(value.length).toBeLessThanOrEqual(4001);
      for (const row of result.results as Result[]) expect(value).toContain(row.ref);
    },
    TIMEOUT
  );
});
