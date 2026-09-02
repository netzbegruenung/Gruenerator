import { describe, it, expect } from 'vitest';

import { validateAndInjectCitations } from './SearchResultProcessor.js';

import type { ReferencesMap } from './types.js';

const filler = 'Einleitung ohne Bezug. '.repeat(20);
const map: ReferencesMap = {
  '1': {
    title: 'Programm',
    snippets: [[filler.slice(0, 300)]],
    chunk_text: `${filler}Der Hitzeaktionsplan sieht Trinkbrunnen in jedem Bezirk vor. ${filler}`,
    description: null,
    date: null,
    source: 's',
    document_id: 'd',
    source_url: null,
    filename: null,
    similarity_score: 0.9,
    chunk_index: 0,
    page_number: null,
  },
};

describe('cited_text', () => {
  it('quotes the passage that carries the question, not the chunk head', () => {
    const { citations } = validateAndInjectCitations('Es gibt Trinkbrunnen.[1]', map, {
      question: 'Was sieht der Hitzeaktionsplan vor?',
    });
    expect(citations[0].cited_text).toContain('Hitzeaktionsplan');
  });

  it('falls back to the snippet without a question', () => {
    const { citations } = validateAndInjectCitations('Aussage.[1]', map);
    expect(citations[0].cited_text).toBe(filler.slice(0, 300));
  });
});
