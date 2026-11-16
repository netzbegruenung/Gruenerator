import { describe, expect, it } from 'vitest';

import { isThreadBusyError } from './threadBusy';

describe('isThreadBusyError', () => {
  it('recognises the stream error code of a busy team chat', () => {
    expect(isThreadBusyError(Object.assign(new Error('busy'), { code: 'thread_busy' }))).toBe(true);
  });

  it('leaves every other failure an error', () => {
    expect(isThreadBusyError(Object.assign(new Error('x'), { code: 'not_your_message' }))).toBe(
      false
    );
    expect(isThreadBusyError(new Error('x'))).toBe(false);
    expect(isThreadBusyError(null)).toBe(false);
    expect(isThreadBusyError('thread_busy')).toBe(false);
  });
});
