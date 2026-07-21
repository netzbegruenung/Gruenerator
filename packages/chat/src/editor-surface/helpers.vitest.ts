import { describe, expect, it } from 'vitest';

import { deriveGateState, shouldImportHistory } from './helpers';

describe('deriveGateState', () => {
  it('reports error, wrapping non-Error throwables', () => {
    const e = deriveGateState({ error: 'boom', isLoading: false, threadId: 't1' });
    expect(e.status).toBe('error');
    expect(e).toMatchObject({ status: 'error' });
    if (e.status === 'error') expect(e.error).toBeInstanceOf(Error);
  });

  it('passes through an Error instance unchanged', () => {
    const err = new Error('nope');
    const e = deriveGateState({ error: err, isLoading: false, threadId: 't1' });
    if (e.status === 'error') expect(e.error).toBe(err);
  });

  it('is loading while the query is in flight', () => {
    expect(deriveGateState({ error: null, isLoading: true, threadId: undefined }).status).toBe(
      'loading'
    );
  });

  it('is loading when resolved but no thread id yet', () => {
    expect(deriveGateState({ error: null, isLoading: false, threadId: null }).status).toBe(
      'loading'
    );
  });

  it('is ready once a thread id is present and not loading', () => {
    expect(deriveGateState({ error: null, isLoading: false, threadId: 't1' }).status).toBe('ready');
  });

  it('prioritises error over a present thread id', () => {
    expect(
      deriveGateState({ error: new Error('x'), isLoading: false, threadId: 't1' }).status
    ).toBe('error');
  });
});

describe('shouldImportHistory', () => {
  it('imports once when idle with messages', () => {
    expect(shouldImportHistory({ alreadyImported: false, messageCount: 3, isRunning: false })).toBe(
      true
    );
  });

  it('never re-imports', () => {
    expect(shouldImportHistory({ alreadyImported: true, messageCount: 3, isRunning: false })).toBe(
      false
    );
  });

  it('skips empty history', () => {
    expect(shouldImportHistory({ alreadyImported: false, messageCount: 0, isRunning: false })).toBe(
      false
    );
  });

  it('never clobbers an in-flight stream', () => {
    expect(shouldImportHistory({ alreadyImported: false, messageCount: 3, isRunning: true })).toBe(
      false
    );
  });
});
