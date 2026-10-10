import { describe, expect, it } from 'vitest';

import { withSourcesMarkdown } from './sourcesAppendix.js';

describe('withSourcesMarkdown', () => {
  it('returns the content unchanged without citations', () => {
    expect(withSourcesMarkdown('Text [1].', undefined)).toBe('Text [1].');
    expect(withSourcesMarkdown('Text [1].', [])).toBe('Text [1].');
  });

  it('numbers the list by citation id, not by position', () => {
    const out = withSourcesMarkdown('A [3] und B [7].', [
      { id: 7, title: 'Sieben' },
      { id: 3, title: 'Drei' },
    ]);
    expect(out).toContain('- **\\[3\\]** Drei');
    expect(out).toContain('- **\\[7\\]** Sieben');
    expect(out.indexOf('Drei')).toBeLessThan(out.indexOf('Sieben'));
  });

  // Renumbering after deduplication shifted every later number away from the
  // `[N]` in the text.
  it('groups chunks of one document under their own ids', () => {
    const out = withSourcesMarkdown('A [1], B [2], C [3].', [
      { id: 1, title: 'Programm', documentId: 'doc-a' },
      { id: 2, title: 'Satzung', documentId: 'doc-b' },
      { id: 3, title: 'Programm', documentId: 'doc-a' },
    ]);
    expect(out).toContain('- **\\[1, 3\\]** Programm');
    expect(out).toContain('- **\\[2\\]** Satzung');
  });

  it('links markers to their source URL', () => {
    const out = withSourcesMarkdown('Fakt [1] und Fakt [1, 2].', [
      { id: 1, title: 'Eins', url: 'https://example.org/eins' },
      { id: 2, title: 'Zwei' },
    ]);
    expect(out).toContain('Fakt [\\[1\\]](<https://example.org/eins>) und');
    expect(out).toContain('Fakt [\\[1\\]](<https://example.org/eins>)\\[2\\].');
    expect(out).toContain('- **\\[1\\]** Eins, <https://example.org/eins>');
  });

  it('leaves markers without a known citation or a web URL alone', () => {
    const out = withSourcesMarkdown('Im Jahr [2024] laut [1].', [
      { id: 1, title: 'Intern', url: '/documents/abc' },
    ]);
    expect(out.startsWith('Im Jahr [2024] laut [1].')).toBe(true);
    expect(out).toContain('- **\\[1\\]** Intern');
    expect(out).not.toContain('/documents/abc');
  });

  it('escapes markdown in titles and shows the collection', () => {
    const out = withSourcesMarkdown('X [1].', [
      { id: 1, title: 'Wahl*programm* [2025]', collectionName: 'Grundsatz' },
    ]);
    expect(out).toContain('Wahl\\*programm\\* \\[2025\\] (*Grundsatz*)');
  });

  it('skips entries without a numeric id', () => {
    const out = withSourcesMarkdown('X.', [{ id: 0, title: 'Kaputt' }]);
    expect(out).toBe('X.');
  });
});
