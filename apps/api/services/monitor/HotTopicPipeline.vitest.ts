import { describe, it, expect } from 'vitest';

import { mapCitations } from './HotTopicPipeline.js';

import type { ResearchCitation } from './research/researchOrchestrator.js';

describe('mapCitations', () => {
  it('keeps documentId/chunkIndex on a document-origin citation', () => {
    const citations: ResearchCitation[] = [
      {
        id: 1,
        title: 'Grundsatzprogramm',
        url: 'https://gruene.de/grundsatzprogramm',
        domain: 'gruene.de',
        snippet: 'Auszug aus dem Programm',
        documentId: '20200125_Grundsatzprogramm',
        chunkIndex: 3,
      },
    ];

    const [mapped] = mapCitations(citations);

    expect(mapped).toMatchObject({
      id: '1',
      documentId: '20200125_Grundsatzprogramm',
      chunkIndex: 3,
    });
  });

  it('leaves documentId/chunkIndex off a web citation', () => {
    const citations: ResearchCitation[] = [
      {
        id: 1,
        title: 'Nachrichtenartikel',
        url: 'https://example.com/artikel',
        domain: 'example.com',
        snippet: 'Ein Zitat aus einem Artikel',
      },
    ];

    const [mapped] = mapCitations(citations);

    expect(mapped.documentId).toBeUndefined();
    expect(mapped.chunkIndex).toBeUndefined();
  });
});
