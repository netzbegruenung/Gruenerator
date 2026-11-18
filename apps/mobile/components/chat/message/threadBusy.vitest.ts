import {
  ChatStreamError,
  errorStatus,
} from '../../../../../packages/chat/src/runtime/streamErrorMessage';
import { describe, expect, it } from 'vitest';

import { isThreadBusyStatus } from './threadBusy';

describe('isThreadBusyStatus', () => {
  it('recognises the real errorStatus() of a thread_busy stream error', () => {
    const status = errorStatus(
      new ChatStreamError('Gerade entsteht schon eine Antwort in diesem Chat. Warte kurz.', {
        code: 'thread_busy',
        retryable: true,
      })
    );
    expect(isThreadBusyStatus(status)).toBe(true);
  });

  it('falls back to the server wording when the code is missing', () => {
    expect(
      isThreadBusyStatus({
        type: 'incomplete',
        reason: 'error',
        error: 'Gerade entsteht schon eine Antwort in diesem Chat. Warte kurz.',
      })
    ).toBe(true);
  });

  it('leaves every other failure an error', () => {
    expect(
      isThreadBusyStatus(errorStatus(new ChatStreamError('x', { code: 'not_your_message' })))
    ).toBe(false);
    expect(isThreadBusyStatus(errorStatus(new Error('x')))).toBe(false);
    expect(isThreadBusyStatus(null)).toBe(false);
  });
});
