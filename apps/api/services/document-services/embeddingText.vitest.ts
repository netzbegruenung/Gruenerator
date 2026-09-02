import { describe, expect, it } from 'vitest';

import { buildEmbeddingText, buildEmbeddingTextsForChunks } from './embeddingText.js';

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
});

describe('buildEmbeddingText mit Überschriftenpfad', () => {
  it('stellt Titel und Pfad voran, mit › getrennt', () => {
    expect(
      buildEmbeddingText('Der Zuschuss beträgt 30 Prozent.', 'Wahlprogramm 2026', [
        'Kapitel 3: Wärmewende',
        '3.1 Förderprogramme',
      ])
    ).toBe(
      'Wahlprogramm 2026 › Kapitel 3: Wärmewende › 3.1 Förderprogramme\n\nDer Zuschuss beträgt 30 Prozent.'
    );
  });

  it('kommt ohne Titel mit dem Pfad allein aus', () => {
    expect(buildEmbeddingText('Text.', null, ['Kapitel 1'])).toBe('Kapitel 1\n\nText.');
  });

  it('überspringt den Teil, den der Chunk schon trägt', () => {
    const chunk = '3.1 Förderprogramme\nDer Zuschuss beträgt 30 Prozent.';
    expect(buildEmbeddingText(chunk, null, ['3.1 Förderprogramme'])).toBe(chunk);
  });

  it('deckelt den Pfad wie den Titel bei 200 Zeichen', () => {
    const result = buildEmbeddingText('Chunk.', null, ['P'.repeat(300)]);
    expect(result.startsWith('P'.repeat(200) + '\n\n')).toBe(true);
    expect(result).not.toContain('P'.repeat(201));
  });

  it('verhält sich ohne Pfad wie bisher', () => {
    expect(buildEmbeddingText('Text.', 'Titel')).toBe('Titel\n\nText.');
    expect(buildEmbeddingText('Text.', null, [])).toBe('Text.');
    expect(buildEmbeddingText('Text.', null, null)).toBe('Text.');
  });

  it('zieht den Pfad je Chunk aus dessen Metadaten', () => {
    expect(
      buildEmbeddingTextsForChunks(
        [
          { text: 'A.', metadata: { headingPath: ['Kapitel 1'] } },
          { text: 'B.', metadata: {} },
        ],
        'Titel'
      )
    ).toEqual(['Titel › Kapitel 1\n\nA.', 'Titel\n\nB.']);
  });
});
