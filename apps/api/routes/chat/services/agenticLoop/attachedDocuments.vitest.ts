import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

import {
  attachedDocsQuery,
  readAttachedDocumentSlice,
  retrievableAttachedSources,
  retrieveAttachedDocuments,
  SLICE_DEFAULT_CHARS,
  SLICE_MAX_CHARS,
  SLICE_REGISTER_CHARS,
} from './attachedDocuments.js';

import type {
  ChatGraphState,
  DocumentSource,
} from '../../../../agents/langgraph/ChatGraph/types.js';

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
}));

const fullText = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
/**
 * Reine Attrappe, KEIN `importOriginal` — `readAttachedDocumentSlice` erreicht
 * dieses Modul erst über ein `await import()` mitten im Aufruf. Eine Fabrik, die
 * das echte Modul lädt, läuft damit nicht beim Import der Testdatei, sondern auf
 * der Uhr des ERSTEN Tests, der sie auslöst. Der ganze DocumentSearchService-Graph
 * ist auf einem langsamen Runner mehr als die 5 s `testTimeout` wert — und
 * während die Fabrik noch fliegt, liefert vite-node dem nächsten Aufruf desselben
 * Pfads das ECHTE Modul zurück. Genau so war master am 28.08.2026 rot: erster
 * Test „Test timed out in 5000ms", zweiter „Qdrant not available" aus dem
 * leibhaftigen `DocumentSearchService` (#3013).
 *
 * Der Unterschied zu `toolCatalog.vitest.ts`, das dasselbe Modul MIT
 * `importOriginal` mockt und grün bleibt: dort zieht eine statische Kette
 * (`directSearch` → `exampleSearchService`) das Modul schon beim Import der
 * Datei herein. Hier ist `searchNode` komplett attrappiert, und damit ist das
 * `await import()` der einzige Weg dorthin. Wer hier `importOriginal` nachrüstet,
 * baut die Bombe wieder ein — und `toolCatalog` umgekehrt auf eine reine
 * Attrappe umzustellen bricht sofort (`DocumentSearchService is not a
 * constructor`).
 */
vi.mock('../../../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({ getMultipleDocumentsFullText: fullText }),
}));

const src = (kind: DocumentSource['kind'], id: string, label = id): DocumentSource => ({
  kind,
  id,
  label,
});

const stateWith = (over: Partial<ChatGraphState> = {}): ChatGraphState =>
  ({
    documentSources: [],
    searchQuery: null,
    lastUserTextNoMentions: '',
    agentConfig: { userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

describe('retrievableAttachedSources', () => {
  it('nimmt die drei Dokumentarten und lässt alles andere liegen', () => {
    const state = stateWith({
      documentSources: [
        src('document', 'a'),
        src('document_chat', 'b'),
        src('doc_mention', 'c'),
        src('notebook', 'n'),
        src('wolke', 'w'),
        src('connect', 'x'),
        src('current_doc', 'd'),
      ],
    });
    expect(retrievableAttachedSources(state).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * Notebooks haben im Loop eigene Werkzeuge. Nähme der Filter sie mit, zahlte
   * JEDER Notebook-Turn den Vorab-Abruf ein zweites Mal — der Seed läuft
   * unbedingt, sobald diese Liste nicht leer ist.
   */
  it('lässt einen reinen Notebook-Turn leer — sonst sucht der Seed doppelt', () => {
    const state = stateWith({ documentSources: [src('notebook', 'berlin')] });
    expect(retrievableAttachedSources(state)).toEqual([]);
  });

  it('verträgt einen Zustand ohne Dokumentquellen', () => {
    expect(retrievableAttachedSources(stateWith())).toEqual([]);
  });
});

describe('attachedDocsQuery', () => {
  it('nimmt die vom Klassifikator verfeinerte Suchanfrage', () => {
    const state = stateWith({
      searchQuery: 'Zusammenfassung des PDFs',
      lastUserTextNoMentions: 'fasse das pdf zusammen',
    });
    expect(attachedDocsQuery(state)).toBe('Zusammenfassung des PDFs');
  });

  it('fällt auf den Nutzertext zurück, wenn QueryRefine nichts geliefert hat', () => {
    const state = stateWith({ searchQuery: null, lastUserTextNoMentions: 'was steht da zum Rad?' });
    expect(attachedDocsQuery(state)).toBe('was steht da zum Rad?');
  });
});

describe('retrieveAttachedDocuments', () => {
  const originalLoopRerank = process.env.LOOP_RERANK_ENABLED;

  beforeEach(() => fanout.mockReset());

  afterEach(() => {
    if (originalLoopRerank === undefined) delete process.env.LOOP_RERANK_ENABLED;
    else process.env.LOOP_RERANK_ENABLED = originalLoopRerank;
  });

  it('fährt den Fan-out und sortiert über alle Dokumente nach Relevanz', async () => {
    fanout.mockResolvedValue({
      perSourceResults: {
        a: [{ source: 'documentchat:a', title: 'A', content: 'schwach', relevance: 0.2 }],
        b: [{ source: 'documentchat:b', title: 'B', content: 'stark', relevance: 0.9 }],
      },
      searchedCollections: [],
      errors: [],
    });
    const state = stateWith({
      documentSources: [src('document_chat', 'a'), src('document_chat', 'b')],
    });

    const results = await retrieveAttachedDocuments(state, 'Radverkehr');
    expect(results.map((r) => r.content)).toEqual(['stark', 'schwach']);
    expect(fanout).toHaveBeenCalledTimes(1);
  });

  /**
   * `rerankChunks` hängt am selben Flag wie der Loop-Suchpfad
   * (`LOOP_RERANK_ENABLED`) — seit der Validator-Reparatur in 03e297cca4
   * kommt die Option beim Dienst tatsächlich an, und ein unbedingtes `true`
   * würde den Cross-Encoder für jeden Anhang unbemerkt scharfschalten.
   */
  it('lässt das Chunk-Reranking ohne LOOP_RERANK_ENABLED weg', async () => {
    delete process.env.LOOP_RERANK_ENABLED;
    fanout.mockResolvedValue({ perSourceResults: {}, searchedCollections: [], errors: [] });
    const state = stateWith({ documentSources: [src('document_chat', 'a')] });

    await retrieveAttachedDocuments(state, 'Löschfristen');

    expect(fanout.mock.calls[0]?.[3]).toEqual({});
  });

  it('bestellt das Chunk-Reranking mit LOOP_RERANK_ENABLED=true', async () => {
    process.env.LOOP_RERANK_ENABLED = 'true';
    fanout.mockResolvedValue({ perSourceResults: {}, searchedCollections: [], errors: [] });
    const state = stateWith({ documentSources: [src('document_chat', 'a')] });

    await retrieveAttachedDocuments(state, 'Löschfristen');

    expect(fanout.mock.calls[0]?.[3]).toEqual({ rerankChunks: true });
  });

  it('ruft ohne Dokumente und ohne Abfrage gar nichts ab', async () => {
    await expect(retrieveAttachedDocuments(stateWith(), 'x')).resolves.toEqual([]);
    const state = stateWith({ documentSources: [src('document_chat', 'a')] });
    await expect(retrieveAttachedDocuments(state, '')).resolves.toEqual([]);
    expect(fanout).not.toHaveBeenCalled();
  });
});

describe('readAttachedDocumentSlice', () => {
  // `readAttachedDocumentSlice` reaches the document service through a lazy
  // `await import()`, so whichever test calls it first pays for loading that
  // whole module graph — measured at ~4.9 s on CI, against a 5 s test budget.
  // It tipped over often enough to keep master red, and it did not fail alone:
  // aborting the first test mid-import left the next one resolving the real
  // module instead of the mock below, which then threw "Qdrant not available".
  // Warming the import here buys the cost once, outside anyone's timeout.
  beforeAll(async () => {
    await import('../../../../services/document-services/DocumentSearchService/index.js');
  });

  beforeEach(() => fullText.mockReset());

  const sources = [src('document_chat', 'doc-1', 'Beschlusspapier.pdf')];

  it('liefert die erste Scheibe samt Wegweiser zur nächsten', async () => {
    fullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'x'.repeat(25_000) }] });

    const [result] = await readAttachedDocumentSlice(stateWith(), sources, { from: 0 });
    expect(result?.title).toBe('Beschlusspapier.pdf');
    // Der Wegweiser ist der einzige Weg, auf dem das Modell erfährt, dass noch
    // etwas kommt — ohne ihn hält es die Scheibe für das ganze Dokument.
    expect(result?.content).toContain(`weiter mit abschnitt.von=${SLICE_DEFAULT_CHARS}`);
    expect(result?.content).toContain('von 25000');
  });

  /**
   * Gekappt wird immer der Schwanz — in `applyContextCap` und in der
   * gemeinsamen Schrumpfung von `renderAll`. Stünde der Wegweiser am Ende, wäre
   * er genau in den Fällen weg, für die er gebaut ist.
   */
  it('stellt den Wegweiser voran, wo keine Kappung ihn erwischt', async () => {
    fullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'x'.repeat(25_000) }] });

    const [result] = await readAttachedDocumentSlice(stateWith(), sources, { from: 0 });
    expect(result?.content.startsWith('[Zeichen 0–')).toBe(true);
  });

  /**
   * Die Scheibe muss in das passen, was `sourceRegistry.register` durchlässt.
   * Lag sie darüber (40.000 gegen 12.000), bekam das Modell 12k Text, las im
   * Wegweiser aber „Zeichen 0–40000" und übersprang beim Weiterlesen still 28k.
   */
  it('bleibt mitsamt Wegweiser unter dem Registrierungs-Deckel', async () => {
    fullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'x'.repeat(200_000) }] });

    const [result] = await readAttachedDocumentSlice(stateWith(), sources, {
      from: 0,
      chars: 999_999,
    });
    expect(SLICE_MAX_CHARS).toBeLessThan(SLICE_REGISTER_CHARS);
    expect((result?.content ?? '').length).toBeLessThanOrEqual(SLICE_REGISTER_CHARS);
  });

  it('markiert das Ende, statt einen Wegweiser ins Leere zu setzen', async () => {
    fullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'x'.repeat(1_000) }] });

    const [result] = await readAttachedDocumentSlice(stateWith(), sources, { from: 500 });
    expect(result?.content).toContain('Ende des Dokuments');
    expect(result?.content).not.toContain('weiter mit');
  });

  it('deckelt eine geratene Zeichenzahl, statt die Lane zu sprengen', async () => {
    fullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'x'.repeat(200_000) }] });

    const [result] = await readAttachedDocumentSlice(stateWith(), sources, {
      from: 0,
      chars: 999_999,
    });
    expect((result?.content ?? '').replace(/^\[Zeichen[^\]]*]\n\n/, '')).toHaveLength(
      SLICE_MAX_CHARS
    );
  });

  it('überspringt Dokumente ohne Text und hinter dem Ende', async () => {
    fullText.mockResolvedValue({
      documents: [
        { id: 'doc-1', fullText: '' },
        { id: 'doc-2', fullText: 'kurz' },
      ],
    });
    const zwei = [...sources, src('document_chat', 'doc-2', 'Zweitdatei.pdf')];

    await expect(readAttachedDocumentSlice(stateWith(), zwei, { from: 9_000 })).resolves.toEqual(
      []
    );
  });
});
