import { describe, expect, it } from 'vitest';

import { resolveResumeInput } from './resumeInput.js';

describe('resolveResumeInput', () => {
  // Regression guard: the ask_human clarification resume must keep working
  // exactly as before while the client-tool path is added around it.
  it('treats a bare `resume` string as an ask_human answer', () => {
    expect(resolveResumeInput({ threadId: 'x', resume: 'Berlin' } as never)).toEqual({
      kind: 'ask_human',
      answer: 'Berlin',
    });
  });

  it('accepts an empty-string ask_human answer', () => {
    expect(resolveResumeInput({ resume: '' })).toEqual({ kind: 'ask_human', answer: '' });
  });

  it('treats a toolName + result as a client_tool resume', () => {
    const result = { operation: 'Tabellen-Berechnung', entries: [], summary: 'Gesamtgewinn: 51' };
    expect(resolveResumeInput({ toolName: 'run_python', result })).toEqual({
      kind: 'client_tool',
      toolName: 'run_python',
      result,
    });
  });

  it('lets toolName win when both are present (explicit client-tool resume)', () => {
    expect(resolveResumeInput({ resume: 'ignored', toolName: 'run_python', result: 42 })).toEqual({
      kind: 'client_tool',
      toolName: 'run_python',
      result: 42,
    });
  });

  it('returns null when neither field is present', () => {
    expect(resolveResumeInput({})).toBeNull();
    expect(resolveResumeInput({ toolName: '' })).toBeNull();
  });
});
