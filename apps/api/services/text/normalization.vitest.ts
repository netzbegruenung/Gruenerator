/**
 * Tests for text normalization and fuzzy matching
 *
 * Covers:
 * - Levenshtein distance calculation
 * - containsNormalized with exact matches
 * - containsNormalized with fuzzy matching (typo tolerance)
 * - German-specific normalization (umlauts, compounds)
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import {
  levenshteinDistance,
  containsNormalized,
  normalizeQuery,
  normalizeText,
  foldUmlauts,
  generateQueryVariants,
} from './normalization.js';

// ============================================================================
// Levenshtein Distance
// ============================================================================

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('klimaschutz', 'klimaschutz')).toBe(0);
  });

  it('returns string length for empty comparison', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('calculates single-char edits correctly', () => {
    expect(levenshteinDistance('klimaschtz', 'klimaschutz')).toBe(1);
    expect(levenshteinDistance('klimashcutz', 'klimaschutz')).toBe(2);
    expect(levenshteinDistance('cat', 'hat')).toBe(1);
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('handles German words with typos', () => {
    expect(levenshteinDistance('energiwende', 'energiewende')).toBe(1);
    expect(levenshteinDistance('verkehrswende', 'verkehrswende')).toBe(0);
    expect(levenshteinDistance('fahrad', 'fahrrad')).toBe(1);
    expect(levenshteinDistance('bundestag', 'bundestag')).toBe(0);
  });
});

// ============================================================================
// containsNormalized — Exact Matching
// ============================================================================

describe('containsNormalized — exact matching', () => {
  const sampleText = 'Der Klimaschutz ist ein zentrales Thema der Energiewende in Deutschland.';

  it('finds exact query in text', () => {
    expect(containsNormalized(sampleText, 'Klimaschutz')).toBe(true);
    expect(containsNormalized(sampleText, 'klimaschutz')).toBe(true);
    expect(containsNormalized(sampleText, 'Energiewende')).toBe(true);
  });

  it('finds multi-word queries', () => {
    expect(containsNormalized(sampleText, 'Klimaschutz Energiewende')).toBe(true);
  });

  it('returns false for absent terms', () => {
    expect(containsNormalized(sampleText, 'Windkraft')).toBe(false);
    expect(containsNormalized(sampleText, 'Solar')).toBe(false);
  });

  it('handles umlaut folding', () => {
    const umlautText = 'Die Grünen fordern eine Verkehrsänderung';
    expect(containsNormalized(umlautText, 'gruenen')).toBe(true);
    expect(containsNormalized(umlautText, 'Grünen')).toBe(true);
  });

  it('returns false for empty inputs', () => {
    expect(containsNormalized(sampleText, '')).toBe(false);
    expect(containsNormalized('', 'test')).toBe(false);
  });
});

// ============================================================================
// containsNormalized — Fuzzy Matching (Typo Tolerance)
// ============================================================================

describe('containsNormalized — fuzzy matching', () => {
  const sampleText = 'Der Klimaschutz ist ein zentrales Thema der Energiewende in Deutschland.';

  it('matches single-word typo: klimaschtz → Klimaschutz (1 char missing)', () => {
    expect(containsNormalized(sampleText, 'klimaschtz')).toBe(true);
  });

  it('matches single-word typo: klimashcutz → Klimaschutz (transposition)', () => {
    expect(containsNormalized(sampleText, 'klimashcutz')).toBe(true);
  });

  it('matches single-word typo: energiwende → Energiewende (1 char missing)', () => {
    expect(containsNormalized(sampleText, 'energiwende')).toBe(true);
  });

  it('matches single-word typo: deutchland → Deutschland (1 char missing)', () => {
    expect(containsNormalized(sampleText, 'deutchland')).toBe(true);
  });

  it('rejects words too short for fuzzy matching (< 5 chars)', () => {
    const shortText = 'Das ist ein Test';
    expect(containsNormalized(shortText, 'tst')).toBe(false);
    expect(containsNormalized(shortText, 'tet')).toBe(false);
  });

  it('rejects completely unrelated words', () => {
    expect(containsNormalized(sampleText, 'Fahrrad')).toBe(false);
    expect(containsNormalized(sampleText, 'Bundestag')).toBe(false);
  });

  it('rejects words with too many edits', () => {
    // "klimaaaa" vs "klimaschutz" — distance 6, way too many edits
    expect(containsNormalized(sampleText, 'klimaaaa')).toBe(false);
  });

  it('handles fuzzy matching in multi-word queries', () => {
    expect(containsNormalized(sampleText, 'klimaschtz energiwende')).toBe(true);
  });
});

// ============================================================================
// normalizeQuery
// ============================================================================

describe('normalizeQuery', () => {
  it('lowercases and folds umlauts', () => {
    expect(normalizeQuery('Grüne Ökologie')).toBe('gruene oekologie');
  });

  it('dehyphenates compounds', () => {
    expect(normalizeQuery('Warm- ewende')).toBe('warmewende');
  });

  it('normalizes unicode numbers', () => {
    expect(normalizeQuery('CO₂-Steuer')).toBe('co2-steuer');
  });
});

// ============================================================================
// generateQueryVariants
// ============================================================================

describe('generateQueryVariants', () => {
  it('generates basic variants', () => {
    const variants = generateQueryVariants('Klimaschutz');
    expect(variants).toContain('klimaschutz');
  });

  it('generates hyphen variants', () => {
    const variants = generateQueryVariants('open source');
    expect(variants).toContain('open source');
    expect(variants).toContain('open-source');
    expect(variants).toContain('opensource');
  });

  it('generates umlaut-folded variants', () => {
    const variants = generateQueryVariants('Grüne');
    expect(variants).toContain('grüne');
    expect(variants).toContain('gruene');
  });
});
