import { useAgentStore, useChatConfigStore } from '@gruenerator/chat/stores';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { flagEditResubmit, flagRegenerate } from './threadRunSignals';

/**
 * These assert the handover to the model adapter, not just that a setter ran:
 * every case flags and then calls `consumeRunSignals`, which is what
 * `GrueneratorModelAdapter` does at the start of a run. A signal that is written
 * but never consumed under the adapter's own thread id would be worthless, and
 * only the round trip catches that.
 *
 * Jest lane rather than Vitest: the stores reach `@gruenerator/shared/api`,
 * whose ESM-style `./client.js` specifiers only resolve under the mappings in
 * jest.config.js. No renderer is involved.
 */

const THREAD = 'thread-1';
const OTHER_THREAD = 'thread-2';

function consume(threadId: string | undefined) {
  return useChatConfigStore.getState().consumeRunSignals(threadId);
}

beforeEach(() => {
  useChatConfigStore.setState({ pendingRunSignal: null });
  useAgentStore.setState({ currentThreadId: THREAD });
});

describe('flagRegenerate', () => {
  it('makes the next run of this thread a regenerate', () => {
    flagRegenerate();

    expect(consume(THREAD)).toEqual({ regenerate: true, replaceFromMessageId: undefined });
  });

  it('is consumed once — a second run appends normally', () => {
    flagRegenerate();
    consume(THREAD);

    expect(consume(THREAD)).toEqual({ regenerate: false, replaceFromMessageId: undefined });
  });

  it('does not leak into another thread', () => {
    flagRegenerate();

    expect(consume(OTHER_THREAD)).toEqual({ regenerate: false, replaceFromMessageId: undefined });
  });

  it('writes nothing before a thread exists', () => {
    useAgentStore.setState({ currentThreadId: null });

    flagRegenerate();

    expect(useChatConfigStore.getState().pendingRunSignal).toBeNull();
  });
});

describe('flagEditResubmit', () => {
  it('makes the next run replace everything from the edited message on', () => {
    flagEditResubmit('msg-7');

    expect(consume(THREAD)).toEqual({ regenerate: false, replaceFromMessageId: 'msg-7' });
  });

  it('is consumed once', () => {
    flagEditResubmit('msg-7');
    consume(THREAD);

    expect(consume(THREAD)).toEqual({ regenerate: false, replaceFromMessageId: undefined });
  });

  it('does not leak into another thread', () => {
    flagEditResubmit('msg-7');

    expect(consume(OTHER_THREAD)).toEqual({ regenerate: false, replaceFromMessageId: undefined });
  });

  it('writes nothing without a message id', () => {
    flagEditResubmit('');

    expect(useChatConfigStore.getState().pendingRunSignal).toBeNull();
  });

  it('writes nothing before a thread exists', () => {
    useAgentStore.setState({ currentThreadId: null });

    flagEditResubmit('msg-7');

    expect(useChatConfigStore.getState().pendingRunSignal).toBeNull();
  });
});

describe('the two signals together', () => {
  // The edit path runs on top of a thread that may already carry a regenerate
  // flag from a tap the user then abandoned. Last write wins — otherwise the
  // stale regenerate would replace the wrong turn.
  it('the later flag replaces the earlier one', () => {
    flagRegenerate();
    flagEditResubmit('msg-7');

    expect(consume(THREAD)).toEqual({ regenerate: false, replaceFromMessageId: 'msg-7' });
  });
});
