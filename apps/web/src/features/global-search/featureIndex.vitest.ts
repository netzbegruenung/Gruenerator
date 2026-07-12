/**
 * Tests the client-side feature/tool matching: synonym coverage (video → Reel),
 * ranking, umlaut folding, and the unique-key invariant that keeps React from
 * rendering two rows with the same key.
 */

import { describe, it, expect } from 'vitest';

import { buildFeatureIndex, matchFeatures } from './featureIndex';

const index = buildFeatureIndex({ isAustrian: false, locale: 'de-DE', userAgents: [] });

/** Titles of the top matches for a query. */
const titlesFor = (q: string, limit = 6) => matchFeatures(index, q, limit).map((h) => h.title);
/** Paths of the top matches for a query. */
const pathsFor = (q: string, limit = 6) => matchFeatures(index, q, limit).map((h) => h.path);

describe('matchFeatures — tool search', () => {
  it('finds Reel by its own name', () => {
    expect(pathsFor('reel')).toContain('/studio/video');
  });

  it('finds Reel via the synonym "video"', () => {
    expect(pathsFor('video')).toContain('/studio/video');
  });

  it('finds Reel via a partial synonym "unterti"', () => {
    expect(pathsFor('unterti')).toContain('/studio/video');
  });

  it('finds the Scanner via "ocr"', () => {
    expect(pathsFor('ocr')).toContain('/scanner');
  });

  it('finds Transkription via "audio"', () => {
    expect(pathsFor('audio')).toContain('/transkription');
  });

  it('returns nothing for a term no tool relates to', () => {
    expect(matchFeatures(index, 'quantenphysik')).toHaveLength(0);
  });

  it('ranks a title-prefix match above a keyword-only match', () => {
    // "scanner" is Scanner's title; nothing else should outrank it.
    expect(titlesFor('scanner')[0]).toBe('Scanner');
  });

  it('folds umlauts so an ä query matches the ae-folded title', () => {
    // Both sides fold ä→ae, so the umlaut spelling resolves to the tool.
    expect(pathsFor('zeichenzähler')).toContain('/zeichenzaehler');
    expect(pathsFor('zeichen')).toContain('/zeichenzaehler');
  });

  it('respects the limit', () => {
    expect(matchFeatures(index, 'e', 3).length).toBeLessThanOrEqual(3);
  });
});

describe('buildFeatureIndex — invariants', () => {
  it('assigns a unique key to every entry', () => {
    const keys = index.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('precomputes normalized fields for every entry', () => {
    for (const hit of index) {
      expect(hit.normalizedTitle).toBe(hit.normalizedTitle.toLowerCase());
      expect(Array.isArray(hit.normalizedKeywords)).toBe(true);
    }
  });

  it('includes the curated Reel tool with its canonical path', () => {
    expect(index.some((h) => h.path === '/studio/video')).toBe(true);
  });
});
