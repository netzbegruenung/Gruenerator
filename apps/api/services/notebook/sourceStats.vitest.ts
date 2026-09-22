/**
 * Zählungen für `notebook_quellen action="stats"`: die Node-Zählung eines
 * Texts, die Summe über ein Notebook und die Lemma-Zählung über den
 * NLP-Dienst (Attrappe) samt dem Weg, wenn der Dienst fehlt.
 */
import { describe, expect, it, vi } from 'vitest';

import { fakeChunk, fakeNotebookDeps } from './__fixtures__/fakeNotebookSources.js';
import {
  aggregateLemmas,
  computeSourceStats,
  splitSentences,
  textStats,
  type StatsNlp,
} from './sourceStats.js';

import type { TextStatsResult } from '../nlp/types.js';

describe('textStats', () => {
  it('counts chars, words, sentences and paragraphs', () => {
    const text = 'Der Radweg kommt 2027. Die E-Mail ging raus!\n\nStimmt’s? ja, sagt sie.';
    expect(textStats(text)).toEqual({
      chars: text.length,
      // Der Radweg kommt 2027 Die E-Mail ging raus Stimmt’s ja sagt sie
      words: 12,
      // „ja" klein → kein neuer Satz nach dem Fragezeichen.
      sentences: 3,
      paragraphs: 2,
    });
  });

  it('counts a last sentence without final punctuation and nothing for an empty text', () => {
    expect(textStats('Erster Satz. Zweiter Satz').sentences).toBe(2);
    expect(textStats('  \n\n ')).toEqual({ chars: 5, words: 0, sentences: 0, paragraphs: 0 });
  });
});

describe('splitSentences', () => {
  it('returns each sentence with its offsets in the text', () => {
    const text = 'Erster Satz. Zweiter Satz!';
    const parts = splitSentences(text);
    expect(parts.map((p) => p.text)).toEqual(['Erster Satz.', 'Zweiter Satz!']);
    expect(text.slice(parts[1]!.start, parts[1]!.end)).toBe('Zweiter Satz!');
  });
});

function nlpResult(over: Partial<TextStatsResult>): TextStatsResult {
  return { id: 'd1', tokens: 0, words: 0, sentences: 0, lemmas: [], forms: {}, ...over };
}

describe('aggregateLemmas', () => {
  it('sums lemmas and forms across texts and cuts to topN', () => {
    const out = aggregateLemmas(
      [
        nlpResult({
          lemmas: [
            { lemma: 'wald', pos: 'NOUN', count: 3 },
            { lemma: 'grün', pos: 'ADJ', count: 1 },
          ],
          forms: { Wald: [{ form: 'Wälder', count: 2 }] },
        }),
        nlpResult({
          id: 'd2',
          lemmas: [
            { lemma: 'wald', pos: 'NOUN', count: 1 },
            { lemma: 'see', pos: 'NOUN', count: 2 },
          ],
          forms: {
            Wald: [
              { form: 'Wälder', count: 1 },
              { form: 'Wald', count: 4 },
            ],
          },
        }),
      ],
      { topN: 2, lemmaOf: ['Wald'], perTextLimit: 50 }
    );
    expect(out.lemmas).toEqual([
      { lemma: 'wald', pos: 'NOUN', count: 4 },
      { lemma: 'see', pos: 'NOUN', count: 2 },
    ]);
    expect(out.lemmaOf).toEqual([
      {
        lemma: 'Wald',
        total: 7,
        forms: [
          { form: 'Wald', count: 4 },
          { form: 'Wälder', count: 3 },
        ],
      },
    ]);
    expect(out.complete).toBe(true);
  });

  it('is not complete when a text returned a full per-text list', () => {
    const out = aggregateLemmas(
      [nlpResult({ lemmas: [{ lemma: 'wald', pos: 'NOUN', count: 3 }] })],
      { topN: 5, lemmaOf: [], perTextLimit: 1 }
    );
    expect(out.complete).toBe(false);
  });
});

function nlp(over: Partial<StatsNlp> = {}): StatsNlp {
  return {
    checkHealth: vi.fn(async () => true),
    textStatsBatched: vi.fn(async (texts: Array<{ id: string; text: string }>) =>
      texts.map((t) =>
        nlpResult({ id: t.id, lemmas: [{ lemma: 'radweg', pos: 'NOUN', count: 1 }] })
      )
    ),
    ...over,
  };
}

const SOURCES = [
  {
    id: 'd1',
    title: 'Antrag',
    text: 'Der Radweg kommt. Er ist grün.',
    pageCount: 2,
    vectorCount: 3,
    chunks: [fakeChunk({ index: 0, text: 'x' })],
  },
  { id: 'd2', title: 'Protokoll', text: 'Radweg beschlossen.', pageCount: null, vectorCount: 1 },
];

describe('computeSourceStats', () => {
  it('sums a whole notebook with rows per source', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', lemmas: false, topN: 30 },
      { ...deps, nlp: nlp() }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out).toMatchObject({
      scope: 'notebook',
      exhaustive: true,
      nlpAvailable: null,
      totals: { chars: 49, words: 8, sentences: 3, paragraphs: 2, pages: 2, chunks: 4 },
    });
    expect(out.perSource?.map((r) => [r.sourceId, r.words, r.pages, r.chunks])).toEqual([
      ['d1', 6, 2, 3],
      ['d2', 2, null, 1],
    ]);
  });

  it('counts one source without per-source rows', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', sourceId: 'd2', lemmas: false, topN: 30 },
      { ...deps, nlp: nlp() }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.scope).toBe('source');
    expect(out.perSource).toBeUndefined();
    expect(out.source).toEqual({ id: 'd2', title: 'Protokoll' });
    expect(out.totals.words).toBe(2);
  });

  it('adds lemma counts from the NLP service', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const service = nlp();
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', lemmas: true, lemmaOf: ['Radweg'], topN: 10 },
      { ...deps, nlp: service }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.nlpAvailable).toBe(true);
    expect(out.lemmas).toEqual([{ lemma: 'radweg', pos: 'NOUN', count: 2 }]);
    expect(out.lemmasExhaustive).toBe(true);
    expect(service.textStatsBatched).toHaveBeenCalledWith(
      [
        { id: 'd1', text: 'Der Radweg kommt. Er ist grün.' },
        { id: 'd2', text: 'Radweg beschlossen.' },
      ],
      expect.objectContaining({ lemmaOf: ['Radweg'] })
    );
  });

  it('degrades to Node counts when the NLP service is down', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const service = nlp({ checkHealth: vi.fn(async () => false) });
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', lemmas: true, topN: 10 },
      { ...deps, nlp: service }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.nlpAvailable).toBe(false);
    expect(out.lemmas).toBeUndefined();
    expect(out.note).toBe(
      'Lemma-Zählungen sind gerade nicht verfügbar (Sprachdienst nicht erreichbar) — die Zahlen oben sind reine Textzählungen.'
    );
    expect(out.totals.words).toBe(8);
    expect(service.textStatsBatched).not.toHaveBeenCalled();
  });

  it('degrades when the NLP call itself fails', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', lemmas: true, topN: 10 },
      { ...deps, nlp: nlp({ textStatsBatched: vi.fn(async () => []) }) }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.nlpAvailable).toBe(false);
    expect(out.lemmas).toBeUndefined();
  });

  it('is not exhaustive when the scan budget cuts the notebook', async () => {
    const { deps } = fakeNotebookDeps(SOURCES);
    const out = await computeSourceStats(
      { collectionId: 'n1', userId: 'u1', lemmas: false, topN: 10, charBudget: 20 },
      { ...deps, nlp: nlp() }
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.totals.chars).toBe(20);
  });
});
