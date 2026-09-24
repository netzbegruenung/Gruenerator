import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  attachedDocsQuery,
  retrievableAttachedSources,
  retrieveAttachedDocuments,
} from './attachedDocuments.js';

import type {
  ChatGraphState,
  DocumentSource,
} from '../../../../agents/langgraph/ChatGraph/types.js';

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
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
