import { describe, it, expect } from 'vitest';

import { selectNarration, computeToolGroupView, type PartLike } from './narrationView';

describe('selectNarration', () => {
  const parts: PartLike[] = [
    { type: 'text' },
    { type: 'tool-call', toolCallId: 't1', narration: 'Ich suche jetzt danach.' },
    { type: 'tool-call', toolCallId: 't2' },
  ];

  it('returns the narration for the matching tool-call part', () => {
    expect(selectNarration(parts, 't1')).toBe('Ich suche jetzt danach.');
  });

  it('returns null when the part has no narration', () => {
    expect(selectNarration(parts, 't2')).toBeNull();
  });

  it('returns null when no part matches the id', () => {
    expect(selectNarration(parts, 'missing')).toBeNull();
  });

  it('returns null for an empty narration string', () => {
    expect(
      selectNarration([{ type: 'tool-call', toolCallId: 't3', narration: '' }], 't3')
    ).toBeNull();
  });
});

describe('computeToolGroupView', () => {
  it('passthrough for a single card (not a run)', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search'],
      sameParentRun: false,
      isStreaming: false,
    });
    expect(v.mode).toBe('passthrough');
  });

  it('passthrough when cards do not form one run (sameParentRun false)', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search', 'web_search'],
      sameParentRun: false,
      isStreaming: false,
    });
    expect(v.mode).toBe('passthrough');
  });

  it('passthrough for a short finished run (below threshold)', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search', 'web_search'],
      sameParentRun: true,
      isStreaming: false,
    });
    // 2 cards, same run, done, threshold 4 → stays inline (narration visible).
    expect(v.mode).toBe('passthrough');
  });

  it('live-header for a streaming run of >=2 cards, with an aggregated label', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search', 'gruenerator_search', 'web_search'],
      sameParentRun: true,
      isStreaming: true,
    });
    expect(v.mode).toBe('live-header');
    expect(v.headerLabel).toBe('2 Suchen, 1 Suche');
  });

  it('collapsed for a finished long run at/over the threshold', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search', 'gruenerator_search', 'web_search', 'scrape_url'],
      sameParentRun: true,
      isStreaming: false,
    });
    expect(v.mode).toBe('collapsed');
    expect(v.summary).toContain('Suchen');
    expect(v.summary).toContain('Webseite gelesen');
  });

  it('respects a custom longRunThreshold', () => {
    const v = computeToolGroupView({
      toolNames: ['gruenerator_search', 'web_search'],
      sameParentRun: true,
      isStreaming: false,
      longRunThreshold: 2,
    });
    expect(v.mode).toBe('collapsed');
  });
});
