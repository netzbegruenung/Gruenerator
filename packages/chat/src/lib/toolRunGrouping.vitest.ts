import { describe, expect, it } from 'vitest';

import { selectToolRun } from './toolRunGrouping';

import type { PartLike } from './narrationView';

function card(id: string, toolName: string, parentId = 'run-1'): PartLike {
  return { type: 'tool-call', toolCallId: id, toolName, parentId };
}

const text: PartLike = { type: 'text' };

describe('selectToolRun', () => {
  it('returns null for an id that is not among the parts', () => {
    expect(selectToolRun([card('a', 'sharepic')], 'nope', true)).toBeNull();
  });

  it('leaves a single card alone', () => {
    const run = selectToolRun([card('a', 'sharepic')], 'a', true);
    expect(run?.view.mode).toBe('passthrough');
    expect(run?.isRunStart).toBe(true);
  });

  it('collects a streaming run of two under a live header', () => {
    const parts = [card('a', 'sharepic'), card('b', 'create_document')];
    const run = selectToolRun(parts, 'a', true);
    expect(run?.view.mode).toBe('live-header');
    expect(run?.view.headerLabel).toContain('Sharepic');
    expect(run?.runKey).toBe('a');
  });

  it('marks only the first card of a run as the chrome owner', () => {
    const parts = [card('a', 'sharepic'), card('b', 'create_document')];
    expect(selectToolRun(parts, 'a', true)?.isRunStart).toBe(true);
    expect(selectToolRun(parts, 'b', true)?.isRunStart).toBe(false);
    // Both agree on the run identity, so they share one expand state.
    expect(selectToolRun(parts, 'b', true)?.runKey).toBe('a');
  });

  it('collapses a finished long run', () => {
    const parts = ['a', 'b', 'c', 'd'].map((id) => card(id, 'sharepic'));
    expect(selectToolRun(parts, 'a', false)?.view.mode).toBe('collapsed');
  });

  it('does not treat a finished run as streaming', () => {
    const parts = [card('a', 'sharepic'), card('b', 'create_document')];
    // Two cards, message done → short finished run, no chrome.
    expect(selectToolRun(parts, 'a', false)?.view.mode).toBe('passthrough');
  });

  it('does not collect cards from different parents', () => {
    const parts = [card('a', 'sharepic', 'run-1'), card('b', 'create_document', 'run-2')];
    expect(selectToolRun(parts, 'a', true)?.view.mode).toBe('passthrough');
  });

  it('breaks the run at a non-tool part', () => {
    const parts = [card('a', 'sharepic'), text, card('b', 'create_document')];
    expect(selectToolRun(parts, 'a', true)?.view.mode).toBe('passthrough');
  });

  it('counts only the cards that render, but keeps them adjacent', () => {
    // A retrieval step draws no card: it must not be counted ("2 Sharepics"),
    // yet it must not split the run either.
    const parts = [card('a', 'sharepic'), card('s', 'web_search'), card('b', 'sharepic')];
    const run = selectToolRun(parts, 'a', true);
    expect(run?.view.mode).toBe('live-header');
    expect(run?.view.headerLabel).toBe('2 Sharepics');
  });

  it('drops group chrome when only one visible card remains', () => {
    const parts = [card('a', 'sharepic'), card('s', 'web_search')];
    expect(selectToolRun(parts, 'a', true)?.view.mode).toBe('passthrough');
  });

  it('treats a run that is no longer the message tail as finished', () => {
    const parts = [card('a', 'sharepic'), card('b', 'create_document'), text];
    expect(selectToolRun(parts, 'a', true)?.view.mode).toBe('passthrough');
  });
});
