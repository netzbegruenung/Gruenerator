import { describe, it, expect } from 'vitest';

import { extractKeyParagraphs, queryTerms, scoreTextsLexically } from './lexicalPassageScore.js';

describe('queryTerms', () => {
  it('drops stopwords', () => {
    expect(queryTerms('Was ist der Beitragssatz für die Pflege')).toEqual([
      'beitragssatz',
      'pflege',
    ]);
  });

  it('drops tokens shorter than three chars', () => {
    expect(queryTerms('CO2 Ziel ab 30 %')).toEqual(['co2', 'ziel']);
  });

  it('splits on punctuation and keeps umlauts intact', () => {
    expect(queryTerms('Klimaschutz, Förderung & Gebäude?')).toEqual([
      'klimaschutz',
      'förderung',
      'gebäude',
    ]);
  });

  it('returns [] for an empty or stopword-only query', () => {
    expect(queryTerms('')).toEqual([]);
    expect(queryTerms('und oder aber')).toEqual([]);
  });
});

describe('scoreTextsLexically', () => {
  // The reason normalization exists: without it the long paragraph wins purely
  // by having more room for accidental hits.
  it('ranks a short exact match above a long paragraph that merely mentions it', () => {
    const short = 'Der Beitragssatz steigt 2027 auf 3,6 Prozent.';
    const long = `${'Allgemeine Ausführungen zur Sozialversicherung. '.repeat(40)}Beitragssatz.`;
    const [shortScore, longScore] = scoreTextsLexically([short, long], 'Beitragssatz 2027');
    expect(shortScore).toBeGreaterThan(longScore as number);
  });

  it('scores a passage without any query term at zero', () => {
    const [score] = scoreTextsLexically(['Ein völlig anderes Thema hier.'], 'Beitragssatz');
    expect(score).toBe(0);
  });

  it('matches umlaut terms', () => {
    const [hit, miss] = scoreTextsLexically(
      ['Die Förderung wurde erhöht.', 'Nichts davon hier drin.'],
      'Förderung'
    );
    expect(hit).toBeGreaterThan(0);
    expect(miss).toBe(0);
  });

  it('matches inside compounds', () => {
    const [score] = scoreTextsLexically(['Das Klimaschutzgesetz gilt ab 2027.'], 'Klimaschutz');
    expect(score).toBeGreaterThan(0);
  });

  it('returns all zeros when the query has no usable terms', () => {
    expect(scoreTextsLexically(['a', 'b', 'c'], 'und oder')).toEqual([0, 0, 0]);
  });

  it('returns one score per input, in input order', () => {
    const texts = ['Beitragssatz hier.', 'Nichts.', 'Beitragssatz und Beitragssatz.'];
    const scores = scoreTextsLexically(texts, 'Beitragssatz');
    expect(scores).toHaveLength(3);
    expect(scores[1]).toBe(0);
    expect(scores[2]).toBeGreaterThan(scores[0] as number);
  });

  it('handles empty strings without dividing by zero', () => {
    expect(scoreTextsLexically(['', 'Beitragssatz.'], 'Beitragssatz')[0]).toBe(0);
  });
});

// The move out of WebSearchGraph must not change what its two callers get.
describe('extractKeyParagraphs (parity after the move)', () => {
  const page = [
    'Ein einleitender Absatz ohne besondere Relevanz für die gestellte Frage der Nutzerin.',
    'Der Beitragssatz zur Pflegeversicherung steigt im Jahr 2027 auf 3,6 Prozent an, so der Entwurf.',
    'Ein abschließender Absatz mit allgemeinen Hinweisen und weiterführenden Verweisen dazu.',
  ].join('\n\n');

  it('returns short content untouched', () => {
    expect(extractKeyParagraphs('kurz', 'egal', 400)).toBe('kurz');
    expect(extractKeyParagraphs('', 'egal')).toBe('');
  });

  it('prefers the paragraph carrying the query terms', () => {
    const out = extractKeyParagraphs(page, 'Beitragssatz Pflegeversicherung', 150);
    expect(out).toContain('Beitragssatz');
  });

  it('respects maxLength', () => {
    expect(extractKeyParagraphs(page, 'Beitragssatz', 120).length).toBeLessThanOrEqual(120);
  });

  it('truncates with an ellipsis when even one paragraph is too long', () => {
    const out = extractKeyParagraphs(page, 'Beitragssatz', 60);
    expect(out.endsWith('...')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(60);
  });
});
