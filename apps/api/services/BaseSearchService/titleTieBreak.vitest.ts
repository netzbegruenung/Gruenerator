import { describe, it, expect } from 'vitest';

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/**
 * Document scores run into a cap at 1.0, and several documents reach it on a
 * one-word query. Whatever ordered them after that was the map's insertion
 * order — measured on "Nationalpark", four documents shared 1.000 and the one
 * titled "Nationalpark Berchtesgaden" came fourth. These tests hold the
 * tie-break that decides such a case by the title.
 */
const chunk = (docId: string, title: string, text: string, similarity: number): TransformedChunk =>
  ({
    id: `${docId}-c0`,
    document_id: docId,
    documents: { id: docId, title, filename: title },
    chunk_index: 0,
    chunk_text: text,
    similarity,
  }) as unknown as TransformedChunk;

const svc = () => new BaseSearchService({ serviceName: 'Test' });
const titles = (docs: { title?: string }[]) => docs.map((d) => d.title);

describe('Titel-Gleichstand bei kurzen Anfragen', () => {
  it('stellt das Dokument mit dem Begriff im Titel vor das gleich bewertete ohne', async () => {
    const docs = await svc().groupAndRankHybridResults(
      [
        chunk('other', 'Wald und Wild in Bayern', 'Der Nationalpark braucht mehr Personal.', 0.9),
        chunk('named', 'Nationalpark Berchtesgaden', 'Mehr Personal für den Nationalpark.', 0.9),
      ],
      10,
      'Nationalpark',
      {}
    );

    expect(titles(docs)[0]).toBe('Nationalpark Berchtesgaden');
  });

  it('kippt keine echte Rangfolge — ein deutlich besseres Dokument bleibt vorn', async () => {
    const docs = await svc().groupAndRankHybridResults(
      [
        chunk('strong', 'Wald und Wild in Bayern', 'Der Nationalpark braucht Personal.', 0.95),
        chunk('named', 'Nationalpark Berchtesgaden', 'Kurzer Hinweis zum Nationalpark.', 0.55),
      ],
      10,
      'Nationalpark',
      {}
    );

    expect(titles(docs)[0]).toBe('Wald und Wild in Bayern');
  });

  it('greift bei ausformulierten Fragen nicht', async () => {
    // In einem ganzen Satz sagt ein Wort im Titel deutlich weniger, deshalb ist
    // der Entscheider auf kurze Anfragen begrenzt.
    const query = 'Was fordern die Grünen für den Nationalpark Berchtesgaden?';
    const docs = await svc().groupAndRankHybridResults(
      [
        chunk('other', 'Wald und Wild in Bayern', 'Der Nationalpark braucht mehr Personal.', 0.9),
        chunk('named', 'Nationalpark Berchtesgaden', 'Mehr Personal für den Nationalpark.', 0.9),
      ],
      10,
      query,
      {}
    );

    expect(titles(docs)[0]).toBe('Wald und Wild in Bayern');
  });
});
