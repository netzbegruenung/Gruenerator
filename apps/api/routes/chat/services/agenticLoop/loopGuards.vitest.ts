import { describe, it, expect } from 'vitest';

import { createToolLoopGuards, MAX_FAILURES_PER_TOOL, MAX_TOTAL_FAILURES } from './loopGuards.js';

describe('createToolLoopGuards', () => {
  it('flags an immediately-repeated identical call to the same tool', () => {
    const guards = createToolLoopGuards();
    const input = { query: 'a' };
    expect(guards.checkDuplicate('search', input)).toBeNull();
    expect(guards.checkDuplicate('search', input)).not.toBeNull();
    // Different args reset the "last call" key.
    expect(guards.checkDuplicate('search', { query: 'b' })).toBeNull();
  });

  it('only compares against the immediately previous call (not all history)', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('read', {})).toBeNull();
    // A different tool in between means the earlier {} is no longer "last".
    expect(guards.checkDuplicate('apply', {})).toBeNull();
    expect(guards.checkDuplicate('read', {})).toBeNull();
  });

  it('caps failures per tool at MAX_FAILURES_PER_TOOL', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkFailureCap('search')).toBeNull();
    for (let i = 0; i < MAX_FAILURES_PER_TOOL; i++) guards.noteFailure('search');
    expect(guards.checkFailureCap('search')).not.toBeNull();
    // A different tool is unaffected.
    expect(guards.checkFailureCap('web')).toBeNull();
  });

  it('caps total failures across all tools at MAX_TOTAL_FAILURES', () => {
    const guards = createToolLoopGuards();
    for (let i = 0; i < MAX_TOTAL_FAILURES; i++) guards.noteFailure(`tool_${i}`);
    expect(guards.checkTotalFailureBudget()).not.toBeNull();
  });

  it('counts empty completions', () => {
    const guards = createToolLoopGuards();
    expect(guards.emptyCompletions).toBe(0);
    expect(guards.noteEmptyCompletion()).toBe(1);
    expect(guards.noteEmptyCompletion()).toBe(2);
    expect(guards.emptyCompletions).toBe(2);
  });

  it('honours custom caps', () => {
    const guards = createToolLoopGuards({ maxFailuresPerTool: 1, maxTotalFailures: 1 });
    guards.noteFailure('x');
    expect(guards.checkFailureCap('x')).not.toBeNull();
    expect(guards.checkTotalFailureBudget()).not.toBeNull();
  });
});
