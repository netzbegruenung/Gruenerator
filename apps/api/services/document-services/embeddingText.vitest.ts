import { describe, expect, it } from 'vitest';

import { buildEmbeddingText, buildEmbeddingTexts } from './embeddingText.js';

describe('buildEmbeddingText', () => {
  it('prepends the title to the chunk', () => {
    expect(buildEmbeddingText('Der Radverkehr braucht Platz.', 'Radverkehr fördern')).toBe(
      'Radverkehr fördern\n\nDer Radverkehr braucht Platz.'
    );
  });

  it('returns the chunk unchanged without a title', () => {
    expect(buildEmbeddingText('Text ohne Kontext.', null)).toBe('Text ohne Kontext.');
    expect(buildEmbeddingText('Text ohne Kontext.', '   ')).toBe('Text ohne Kontext.');
  });

  it('skips the prefix when the chunk already starts with the title', () => {
    const chunk = 'Radverkehr fördern\nDer erste Absatz des Dokuments.';
    expect(buildEmbeddingText(chunk, 'Radverkehr fördern')).toBe(chunk);
  });

  it('caps overlong titles at 200 chars', () => {
    const title = 'T'.repeat(300);
    const result = buildEmbeddingText('Chunk.', title);
    expect(result.startsWith('T'.repeat(200) + '\n\n')).toBe(true);
    expect(result).not.toContain('T'.repeat(201));
  });

  it('maps over chunk arrays', () => {
    expect(buildEmbeddingTexts(['a', 'b'], 'Titel')).toEqual(['Titel\n\na', 'Titel\n\nb']);
  });
});
