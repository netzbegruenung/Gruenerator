import { describe, expect, it } from 'vitest';

import { bm25Terms, cistem, encodeBm25Document, encodeBm25Query, hashTerm } from './bm25.js';

describe('cistem', () => {
  it('stems inflected forms to a common stem', () => {
    expect(cistem('Klimaschutzes')).toBe(cistem('Klimaschutz'));
    expect(cistem('Programmen')).toBe(cistem('Programme'));
    expect(cistem('grüner')).toBe(cistem('grüne'));
  });

  it('normalizes ß to ss', () => {
    expect(cistem('Straße')).toBe(cistem('Strasse'));
  });

  it('keeps short words intact', () => {
    expect(cistem('Ei')).toBe('ei');
  });
});

describe('bm25Terms', () => {
  it('removes stopwords and stems', () => {
    const terms = bm25Terms('Was steht in dem Grundsatzprogramm zu Klimaschutz?');
    expect(terms).not.toContain('was');
    expect(terms).not.toContain('dem');
    expect(terms).toContain(cistem('grundsatzprogramm'));
    expect(terms).toContain(cistem('klimaschutz'));
  });

  it('keeps numbers as-is', () => {
    expect(bm25Terms('Wahlprogramm 2024')).toContain('2024');
  });

  it('splits hyphenated compounds', () => {
    const terms = bm25Terms('EU-Wahlprogramm');
    expect(terms).toContain(cistem('eu'));
    expect(terms).toContain(cistem('wahlprogramm'));
  });
});

describe('encodeBm25Document / encodeBm25Query', () => {
  it('document and query side hash matching terms to the same indices', () => {
    const doc = encodeBm25Document('Der Klimaschutz ist zentral für unser Programm.');
    const query = encodeBm25Query('Klimaschutz Programm');
    for (const idx of query.indices) {
      expect(doc.indices).toContain(idx);
    }
  });

  it('matches inflected query forms against the document', () => {
    const doc = encodeBm25Document('Die Förderung erneuerbarer Energien treibt uns an.');
    const query = encodeBm25Query('erneuerbare Energie');
    const overlap = query.indices.filter((i) => doc.indices.includes(i));
    expect(overlap.length).toBeGreaterThan(0);
  });

  it('saturates term frequency (repeated term < proportional weight)', () => {
    const once = encodeBm25Document('Klimaschutz');
    const many = encodeBm25Document(Array(20).fill('Klimaschutz').join(' '));
    const idx = hashTerm(cistem('klimaschutz'));
    const vOnce = once.values[once.indices.indexOf(idx)];
    const vMany = many.values[many.indices.indexOf(idx)];
    expect(vMany).toBeGreaterThan(vOnce);
    expect(vMany).toBeLessThan(vOnce * 20);
  });

  it('returns empty vector for stopword-only text', () => {
    expect(encodeBm25Document('und oder aber').indices).toHaveLength(0);
  });

  it('hashes to stable uint32 indices', () => {
    const h = hashTerm('klimaschutz');
    expect(h).toBe(hashTerm('klimaschutz'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});
