import { describe, it, expect } from 'vitest';

import { chunkPageForDistill } from './passageChunker.js';

const para = (n: number, word = 'Wort'): string => `${`${word} `.repeat(n).trim()}.`;

describe('chunkPageForDistill', () => {
  it('returns [] for empty or whitespace input', () => {
    expect(chunkPageForDistill('')).toEqual([]);
    expect(chunkPageForDistill('   \n\n  \t ')).toEqual([]);
  });

  it('keeps a short page as one chunk', () => {
    const chunks = chunkPageForDistill('Ein kurzer Absatz mit Inhalt, der bleibt.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('Ein kurzer Absatz mit Inhalt, der bleibt.');
    expect(chunks[0]?.order).toBe(0);
  });

  describe('markdown survives', () => {
    it('preserves newlines inside a chunk', () => {
      const page = ['- Erster Punkt.', '- Zweiter Punkt.', '- Dritter Punkt.'].join('\n');
      const chunks = chunkPageForDistill(page);
      expect(chunks[0]?.text).toContain('\n');
      expect(chunks[0]?.text.split('\n')).toHaveLength(3);
    });

    it('preserves table rows', () => {
      const page = ['| Jahr | Satz |', '| --- | --- |', '| 2027 | 3,6 % |'].join('\n');
      expect(chunkPageForDistill(page)[0]?.text).toContain('| 2027 | 3,6 % |');
    });
  });

  describe('headings', () => {
    it('attributes the nearest preceding heading and drops it from the text', () => {
      const page = `# Titel\n\n${para(30)}\n\n## Abschnitt Zwei\n\n${para(30)}`;
      const chunks = chunkPageForDistill(page, { targetChars: 200, minChunkChars: 10 });
      expect(chunks[0]?.heading).toBe('Titel');
      expect(chunks[0]?.text).not.toContain('#');
      expect(chunks[chunks.length - 1]?.heading).toBe('Abschnitt Zwei');
    });

    it('has a null heading before the first one', () => {
      expect(chunkPageForDistill('Vorspann ohne Überschrift hier.')[0]?.heading).toBeNull();
    });
  });

  describe('start offsets point into the ORIGINAL text', () => {
    it('locates every chunk at its real position', () => {
      const page = `${para(60)}\n\n${para(60)}\n\n${para(60)}`;
      for (const chunk of chunkPageForDistill(page, { targetChars: 300, minChunkChars: 10 })) {
        const head = chunk.text.split('\n')[0]?.slice(0, 30) ?? '';
        expect(page.slice(chunk.start, chunk.start + head.length)).toBe(head);
      }
    });

    it('stays exact after an oversized block is sentence-split', () => {
      const page = `Vorspann.\n\n${'Ein Satz mit Inhalt. '.repeat(200)}`;
      const chunks = chunkPageForDistill(page, { targetChars: 400, minChunkChars: 50 });
      expect(chunks.length).toBeGreaterThan(2);
      for (const chunk of chunks) {
        const head = chunk.text.slice(0, 20);
        expect(page.slice(chunk.start, chunk.start + head.length)).toBe(head);
      }
    });

    it('reports offsets in ascending document order', () => {
      const page = `${para(50)}\n\n${para(50)}\n\n${para(50)}\n\n${para(50)}`;
      const chunks = chunkPageForDistill(page, { targetChars: 250, minChunkChars: 10 });
      const starts = chunks.map((c) => c.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(chunks.map((c) => c.order)).toEqual(chunks.map((_, i) => i));
    });
  });

  describe('page chrome', () => {
    it('drops single short lines without terminal punctuation', () => {
      const page = `Startseite\n\nImpressum\n\n${para(40)}`;
      const chunks = chunkPageForDistill(page, { targetChars: 500, minChunkChars: 10 });
      const joined = chunks.map((c) => c.text).join('\n');
      expect(joined).not.toContain('Startseite');
      expect(joined).not.toContain('Impressum');
    });

    // The whole point of this PR is that dropping content by position or length
    // loses answers. A short sentence is content.
    it('keeps a short sentence that answers a question', () => {
      const fact = 'Der Beitragssatz steigt 2027 auf 3,6 Prozent.';
      const chunks = chunkPageForDistill(`${para(40)}\n\n${fact}\n\n${para(40)}`, {
        targetChars: 300,
        minChunkChars: 10,
      });
      expect(chunks.map((c) => c.text).join('\n')).toContain(fact);
    });

    it('keeps short list and table rows', () => {
      const page = `- 2027: 3,6 %\n\n| A | B |\n\n${para(40)}`;
      const joined = chunkPageForDistill(page, { targetChars: 500, minChunkChars: 10 })
        .map((c) => c.text)
        .join('\n');
      expect(joined).toContain('2027: 3,6 %');
      expect(joined).toContain('| A | B |');
    });
  });

  describe('packing', () => {
    it('respects targetChars', () => {
      const page = Array.from({ length: 20 }, () => para(30)).join('\n\n');
      for (const chunk of chunkPageForDistill(page, { targetChars: 400 })) {
        expect(chunk.text.length).toBeLessThanOrEqual(400);
      }
    });

    it('merges a trailing scrap into its predecessor', () => {
      const page = `${para(80)}\n\nRest.`;
      const chunks = chunkPageForDistill(page, { targetChars: 600, minChunkChars: 100 });
      expect(chunks[chunks.length - 1]?.text).toContain('Rest.');
      expect(chunks.every((c) => c.text.length >= 100)).toBe(true);
    });

    it('caps at maxChunks', () => {
      const page = Array.from({ length: 200 }, () => para(60)).join('\n\n');
      expect(chunkPageForDistill(page, { targetChars: 300, maxChunks: 12 })).toHaveLength(12);
    });

    it('splits an oversized single block instead of emitting it whole', () => {
      const page = 'Ein Satz mit etwas Inhalt. '.repeat(300);
      const chunks = chunkPageForDistill(page, { targetChars: 500 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(600);
    });

    it('does not split at a German abbreviation', () => {
      const page = `Das gilt z.B. für Anträge und ${'weitere Fälle '.repeat(40)}Ende.`;
      const chunks = chunkPageForDistill(page, { targetChars: 300 });
      expect(chunks.some((c) => c.text.trimEnd().endsWith('z.B.'))).toBe(false);
    });
  });

  it('never throws and never loses everything', () => {
    const inputs = [
      'x',
      '\n'.repeat(500),
      'A'.repeat(500_000),
      'kein zeilenumbruch aber sehr lang '.repeat(2000),
      '###',
      '| | |',
    ];
    for (const input of inputs) {
      expect(() => chunkPageForDistill(input)).not.toThrow();
    }
    expect(chunkPageForDistill('A'.repeat(500_000)).length).toBeGreaterThan(0);
  });
});
