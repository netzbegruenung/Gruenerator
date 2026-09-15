import { describe, expect, it } from 'vitest';

import { toolErrorMessage, toolOutcome } from './toolResults';

/**
 * A failed tool call used to be indistinguishable from a successful one: the
 * card drew an unconditional green tick and printed the error as neutral grey
 * status text. Worse, the two channels that carry "this failed" disagreed —
 * `ok:false` only exists on the live stream (parseSSEStream folds it in and it
 * was never persisted), `result.error` only if the tool wrote one. Reading
 * either alone left one of the two paths reporting success.
 */
describe('toolOutcome', () => {
  it('is running until the call settles', () => {
    expect(toolOutcome(undefined, 'call')).toBe('running');
    expect(toolOutcome({ error: 'boom' }, 'call')).toBe('running');
    expect(toolOutcome(null, 'result')).toBe('running');
  });

  it('reads the live channel — ok:false with no error string', () => {
    expect(toolOutcome({ ok: false, content: 'x' }, 'result')).toBe('error');
  });

  it('reads the durable channel — result.error with no ok flag (post-reload)', () => {
    expect(toolOutcome({ error: 'Tally: no workspace' }, 'result')).toBe('error');
  });

  it('treats a MISSING ok as success, which is every pre-existing thread', () => {
    expect(toolOutcome({ titel: 'Pressemitteilung' }, 'result')).toBe('ok');
    expect(toolOutcome({ ok: true }, 'result')).toBe('ok');
  });

  it('does not mistake a falsy-but-present payload for a failure', () => {
    // `getBoolean` reports a missing key as false; using it here would have
    // marked every reloaded call as failed.
    expect(toolOutcome({ count: 0 }, 'result')).toBe('ok');
    expect(toolOutcome({ ok: 0 }, 'result')).toBe('ok');
  });
});

describe('toolErrorMessage', () => {
  it('returns the error string, or null', () => {
    expect(toolErrorMessage({ error: 'kaputt' })).toBe('kaputt');
    expect(toolErrorMessage({ ok: false })).toBeNull();
    expect(toolErrorMessage(null)).toBeNull();
    expect(toolErrorMessage({ error: 42 })).toBeNull();
  });
});
