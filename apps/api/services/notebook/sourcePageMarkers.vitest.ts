/**
 * `## Seite N` im gespeicherten Text ist Struktur, kein Inhalt: eine Suche
 * nach „Seite" zählt die Marken nicht mit, und die Statistik zählt sie nicht
 * als Wörter oder Absätze.
 */
import { describe, expect, it } from 'vitest';

import { grepText } from './sourceGrep.js';
import { textStats } from './sourceStats.js';

const MARKED =
  '## Seite 1\n\nDie Seite des Antrags.\n\n## Seite 2\n\nZweiter Absatz ohne das Wort.';
const PLAIN = 'Die Seite des Antrags.\n\nZweiter Absatz ohne das Wort.';

describe('Seitenmarken in grep und stats', () => {
  it('grep „Seite" trifft nur den Fließtext, mit richtigem Offset', () => {
    const result = grepText(MARKED, 'Seite', {});
    expect(result.count).toBe(1);
    const hit = result.hits[0]!;
    expect(MARKED.slice(hit.charStart, hit.charEnd)).toBe('Seite');
    expect(hit.context).not.toContain('## Seite');
  });

  it('stats zählen wie ohne Marken', () => {
    const marked = textStats(MARKED);
    const plain = textStats(PLAIN);
    expect(marked.words).toBe(plain.words);
    expect(marked.paragraphs).toBe(plain.paragraphs);
    expect(marked.sentences).toBe(plain.sentences);
  });
});
