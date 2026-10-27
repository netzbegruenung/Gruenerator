import { describe, expect, it } from 'vitest';

import {
  DEADLINE_TEXT,
  RESUMED_RUN_TEXT,
  WRAP_UP_TEXT,
  classifyRunError,
  resumeMessages,
} from './resume.js';

import type { ModelMessage } from 'ai';

function namedError(name: string, message = 'kaputt'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('classifyRunError', () => {
  it('treats an aborted signal as fatal regardless of the error shape', () => {
    const controller = new AbortController();
    controller.abort();

    expect(classifyRunError(new Error('anything'), controller.signal)).toBe('fatal');
  });

  it('treats abort and timeout errors as fatal even without a signal', () => {
    expect(classifyRunError(namedError('AbortError'))).toBe('fatal');
    expect(classifyRunError(namedError('TimeoutError'))).toBe('fatal');
  });

  /**
   * The research clock is a budget, not a failure: the material is gathered and
   * only the writing is missing, so it earns the same wrap-up leg the step
   * budget gets. The caller's signal remains the one thing that ends a run — and
   * when both have fired it wins, because then nothing is left to write with.
   */
  it('treats its own research deadline as resumable, not as fatal', () => {
    const deadline = new AbortController();
    deadline.abort();

    expect(classifyRunError(namedError('TimeoutError'), undefined, deadline.signal)).toBe(
      'deadline'
    );
  });

  it('lets the caller signal win over the research deadline', () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    caller.abort();
    deadline.abort();

    expect(classifyRunError(namedError('TimeoutError'), caller.signal, deadline.signal)).toBe(
      'fatal'
    );
  });

  it('classifies everything else as transient — outages, 400s, network blips', () => {
    expect(classifyRunError(new Error('502 Bad Gateway'))).toBe('transient');
    expect(classifyRunError('string error')).toBe('transient');
  });
});

describe('resumeMessages', () => {
  const history: ModelMessage[] = [
    { role: 'user', content: 'Frage' },
    { role: 'assistant', content: [{ type: 'text', text: 'Ich plane.' }] },
  ];

  it('resumes a transient failure with the history as it stands', () => {
    expect(resumeMessages(history, 'transient')).toEqual(history);
  });

  it('tells a spent step budget to write the report now', () => {
    expect(resumeMessages(history, 'steps').at(-1)).toEqual({
      role: 'user',
      content: WRAP_UP_TEXT,
    });
  });

  it('tells a deadline resume to stop researching and write, and to mark the gaps', () => {
    const last = resumeMessages(history, 'deadline').at(-1);
    expect(last).toEqual({ role: 'user', content: DEADLINE_TEXT });
    expect(DEADLINE_TEXT).toMatch(/lückenhaft/);
  });

  it('opens a continued run with what happened instead of the question', () => {
    expect(resumeMessages(history, 'restart').at(-1)).toEqual({
      role: 'user',
      content: RESUMED_RUN_TEXT,
    });
  });

  it('never mutates the history it continues from', () => {
    const copy = [...history];
    resumeMessages(history, 'steps');
    expect(history).toEqual(copy);
  });
});
