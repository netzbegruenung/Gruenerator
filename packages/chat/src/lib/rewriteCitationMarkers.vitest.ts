import { describe, it, expect } from 'vitest';

import { rewriteCitationMarkers } from './rewriteCitationMarkers';

describe('rewriteCitationMarkers', () => {
  it('rewrites a single marker to a citation element', () => {
    expect(rewriteCitationMarkers('Laut Bericht [1] steigt der Anteil.')).toBe(
      'Laut Bericht <citation n="1"></citation> steigt der Anteil.'
    );
  });

  it('expands a grouped marker to one element per id', () => {
    // Mirrors processTextWithCitations' group handling: the backend's
    // citation clamp emits "[2, 7]" verbatim and models write groups
    // unprompted — both forms must become adjacent badges.
    expect(rewriteCitationMarkers('Beide Quellen [1, 2] belegen das.')).toBe(
      'Beide Quellen <citation n="1"></citation><citation n="2"></citation> belegen das.'
    );
  });

  it('drops out-of-range ids from a partly out-of-range group', () => {
    expect(rewriteCitationMarkers('Siehe [2, 1234].')).toBe('Siehe <citation n="2"></citation>.');
  });

  it('leaves a fully out-of-range group as literal text', () => {
    expect(rewriteCitationMarkers('Siehe [1234].')).toBe('Siehe [1234].');
    expect(rewriteCitationMarkers('Siehe [1000, 5000].')).toBe('Siehe [1000, 5000].');
  });

  it('leaves non-numeric brackets untouched', () => {
    expect(rewriteCitationMarkers('ein [Link](https://x.test)')).toBe('ein [Link](https://x.test)');
  });

  it('rewrites a marker that arrived as [cite:N] once normalised', () => {
    // The reload path persists `[cite:N]`; the badge layer only knows `[N]`.
    const normalised = 'Laut Quelle [cite:1] stimmt das.'.replace(/\[cite:(\d+)\]/g, '[$1]');
    expect(rewriteCitationMarkers(normalised)).toBe(
      'Laut Quelle <citation n="1"></citation> stimmt das.'
    );
  });

  it('does not touch markers inside fenced code blocks', () => {
    const input = 'Text [1]\n```python\narr[1] = items[2]\n```\nNachsatz [3]';
    expect(rewriteCitationMarkers(input)).toBe(
      'Text <citation n="1"></citation>\n```python\narr[1] = items[2]\n```\nNachsatz <citation n="3"></citation>'
    );
  });

  it('does not touch markers inside inline code', () => {
    expect(rewriteCitationMarkers('Zugriff via `arr[1]` liefert [2].')).toBe(
      'Zugriff via `arr[1]` liefert <citation n="2"></citation>.'
    );
  });

  it('protects code containing single backticks inside a fence', () => {
    const input = '```\nconst s = `tpl [1]`\n[2]\n```\nDanach [3]';
    expect(rewriteCitationMarkers(input)).toBe(
      '```\nconst s = `tpl [1]`\n[2]\n```\nDanach <citation n="3"></citation>'
    );
  });

  it('treats GFM strikethrough as prose, not code', () => {
    expect(rewriteCitationMarkers('~~falsch [1]~~ richtig [2]')).toBe(
      '~~falsch <citation n="1"></citation>~~ richtig <citation n="2"></citation>'
    );
  });

  it('leaves an unclosed code span verbatim to the end', () => {
    expect(rewriteCitationMarkers('Text [1] `code [2]')).toBe(
      'Text <citation n="1"></citation> `code [2]'
    );
  });
});
