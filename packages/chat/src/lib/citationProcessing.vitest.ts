import { isValidElement } from 'react';
import { describe, it, expect } from 'vitest';

import { processTextWithCitations, escapeCitationMarkers } from './citationProcessing';

import type { Citation } from '../hooks/useChatGraphStream';

function citation(id: number): Citation {
  return { id, title: `Quelle ${id}`, url: `https://example.org/${id}`, snippet: '', source: '' };
}

/** The citationIds of every badge the processor emitted, in order. */
function badgeIds(parts: ReturnType<typeof processTextWithCitations>): number[] {
  return parts
    .filter((p) => isValidElement(p))
    .map((p) => (p.props as { citationId: number }).citationId);
}

function textOf(parts: ReturnType<typeof processTextWithCitations>): string {
  return parts.filter((p): p is string => typeof p === 'string').join('');
}

describe('processTextWithCitations', () => {
  const map = new Map([
    [1, citation(1)],
    [2, citation(2)],
  ]);

  it('renders a single marker as one badge', () => {
    const parts = processTextWithCitations('Laut Bericht [1] steigt der Anteil.', map);
    expect(badgeIds(parts)).toEqual([1]);
    expect(textOf(parts)).toBe('Laut Bericht  steigt der Anteil.');
  });

  it('renders a grouped marker as one badge per id', () => {
    // The live defect: "[1, 2]" stayed literal text next to real badges in the
    // same answer, so one reply showed two different citation styles.
    const parts = processTextWithCitations('Beide Quellen [1, 2] belegen das.', map);
    expect(badgeIds(parts)).toEqual([1, 2]);
    expect(textOf(parts)).not.toContain('[1, 2]');
  });

  it('keeps the backed ids of a partly backed group and drops the rest', () => {
    const parts = processTextWithCitations('Siehe [2, 7].', map);
    expect(badgeIds(parts)).toEqual([2]);
  });

  it('leaves a fully unbacked group as literal text', () => {
    const parts = processTextWithCitations('Siehe [7, 8].', map);
    expect(parts).toEqual(['Siehe [7, 8].']);
  });

  it('renders unbacked ids as placeholders while streaming', () => {
    const parts = processTextWithCitations('Siehe [7, 8].', map, true);
    expect(badgeIds(parts)).toEqual([7, 8]);
  });
});

describe('reload normalisation', () => {
  // The reload path is what persists `[cite:N]`; the badge layer only knows
  // `[N]`. Guarding the pairing here keeps the two from drifting apart again.
  it('renders a marker that arrived as [cite:N] once normalised', () => {
    const normalised = 'Laut Quelle [cite:1] stimmt das.'.replace(/\[cite:(\d+)\]/g, '[$1]');
    const parts = processTextWithCitations(normalised, new Map([[1, citation(1)]]));
    expect(badgeIds(parts)).toEqual([1]);
  });
});

describe('escapeCitationMarkers', () => {
  it('escapes single and grouped markers alike', () => {
    expect(escapeCitationMarkers('a [1] b [2, 3] c')).toBe('a \\[1\\] b \\[2, 3\\] c');
  });

  it('leaves non-numeric brackets untouched', () => {
    expect(escapeCitationMarkers('ein [Link](https://x.test)')).toBe('ein [Link](https://x.test)');
  });
});
