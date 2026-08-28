/**
 * The guard that empties the queue when the assistant stops to ask something.
 *
 * Without it the queue treats `requires-action` as "run over", advances, and
 * feeds the next turn into the adapter's re-invocation guard — which appends
 * the message and then aborts it, stranding a user turn behind an unanswered
 * question. It then does the same to every remaining entry.
 *
 * What is pinned here is the predicate and the clearing. That the runtime
 * publishes `requires-action` before the queue advances is upstream's
 * ordering, exercised by the real chat rather than asserted here.
 */
import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueueInterruptGuard } from './useQueueInterruptGuard';

import type { AssistantRuntime } from '@assistant-ui/react';

const notifyWarning = vi.hoisted(() => vi.fn());
vi.mock('../lib/notify', () => ({ notifyWarning }));

function askHuman({ answered }: { answered: boolean }) {
  return {
    role: 'assistant',
    status: { type: 'requires-action', reason: 'tool-calls' },
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'ask_human',
        args: { question: 'Welches Format?' },
        ...(answered ? { result: 'PDF' } : {}),
      },
    ],
  };
}

function fakeRuntime(queued: string[]) {
  const listeners = new Set<() => void>();
  const queue = queued.map((id) => ({ id, prompt: id, parts: [] }));
  const messages: unknown[] = [];

  const runtime = {
    thread: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => ({ messages }),
      composer: {
        getState: () => ({ queue }),
        removeQueueItem(id: string) {
          const at = queue.findIndex((item) => item.id === id);
          if (at >= 0) queue.splice(at, 1);
        },
      },
    },
  } as unknown as AssistantRuntime;

  return {
    runtime,
    queue,
    /** Put `message` at the tail and wake the subscribers, as the store would. */
    publish(message: unknown) {
      messages.push(message);
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

function mount(runtime: AssistantRuntime) {
  function Harness() {
    useQueueInterruptGuard(runtime);
    return null;
  }
  render(<Harness />);
}

describe('useQueueInterruptGuard', () => {
  beforeEach(() => {
    notifyWarning.mockClear();
  });

  it('empties the queue when the assistant is waiting on an answer', () => {
    const h = fakeRuntime(['a', 'b']);
    mount(h.runtime);

    h.publish(askHuman({ answered: false }));

    expect(h.queue).toHaveLength(0);
    expect(notifyWarning).toHaveBeenCalledTimes(1);
  });

  it('clears every waiting turn, not every second one', () => {
    // Removal mutates the queue; walking the live array would skip entries.
    const h = fakeRuntime(['a', 'b', 'c', 'd', 'e']);
    mount(h.runtime);

    h.publish(askHuman({ answered: false }));

    expect(h.queue).toHaveLength(0);
  });

  it('leaves the queue alone once the question has an answer', () => {
    const h = fakeRuntime(['a']);
    mount(h.runtime);

    h.publish(askHuman({ answered: true }));

    expect(h.queue).toHaveLength(1);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('leaves the queue alone for an ordinary finished turn', () => {
    const h = fakeRuntime(['a']);
    mount(h.runtime);

    h.publish({
      role: 'assistant',
      status: { type: 'complete', reason: 'stop' },
      content: [{ type: 'text', text: 'Fertig' }],
    });

    expect(h.queue).toHaveLength(1);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('stays quiet when nothing is waiting', () => {
    const h = fakeRuntime([]);
    mount(h.runtime);

    h.publish(askHuman({ answered: false }));

    expect(notifyWarning).not.toHaveBeenCalled();
  });
});
