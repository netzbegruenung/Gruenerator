/**
 * The guard that empties the queue when the assistant stops to ask something.
 *
 * Without it the queue treats a clarification interrupt as "run over",
 * advances, and feeds the next turn into the adapter's re-invocation guard —
 * which appends the message and then aborts it, stranding a user turn behind an
 * unanswered question. It then does the same to every remaining entry.
 *
 * The signal is the adapter's, not the message status: `requires-action` only
 * appears on surfaces that declare `unstable_humanToolNames`, while the adapter
 * refuses the next run either way. That is the whole reason the editor sidebar
 * can have a queue (#3020), so the tests here drive the signal directly.
 */
import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInterruptSignal, useQueueInterruptGuard } from './useQueueInterruptGuard';

import type { AssistantRuntime } from '@assistant-ui/react';

const notifyWarning = vi.hoisted(() => vi.fn());
vi.mock('../lib/notify', () => ({ notifyWarning }));

/**
 * Models core's own removal: `remove` in `runtime/queue/message-queue.js`
 * rebuilds the lane with `filter`, so a snapshot taken before the loop keeps
 * every entry rather than shrinking under the caller. A fake that spliced in
 * place would exercise semantics the runtime does not have.
 */
function fakeRuntime(queued: string[]) {
  let queue = queued.map((id) => ({ id, parts: [{ type: 'text', text: id }] }));

  const runtime = {
    thread: {
      composer: {
        getState: () => ({ queue }),
        removeQueueItem(id: string) {
          queue = queue.filter((item) => item.id !== id);
        },
      },
    },
  } as unknown as AssistantRuntime;

  return { runtime, remaining: () => queue };
}

/** Mounts the guard and hands back the adapter side of the signal. */
function mount(runtime: AssistantRuntime) {
  let notify: () => void = () => {};

  function Harness() {
    const signal = useInterruptSignal();
    notify = signal.notify;
    useQueueInterruptGuard(runtime, signal);
    return null;
  }

  const view = render(<Harness />);
  return {
    /** What `createGrueneratorModelAdapter` calls as `onInterrupt`. */
    interrupt: () => act(() => notify()),
    unmount: () => view.unmount(),
  };
}

describe('useQueueInterruptGuard', () => {
  beforeEach(() => {
    notifyWarning.mockClear();
  });

  it('empties the queue when the adapter reports an interrupt', () => {
    const h = fakeRuntime(['a', 'b']);
    const guard = mount(h.runtime);

    guard.interrupt();

    expect(h.remaining()).toHaveLength(0);
    expect(notifyWarning).toHaveBeenCalledWith(
      'Wartende Nachrichten entfernt',
      expect.stringContaining('Rückfrage')
    );
  });

  it('hands back every waiting turn, not just the first', () => {
    const h = fakeRuntime(['a', 'b', 'c', 'd', 'e']);
    const guard = mount(h.runtime);

    guard.interrupt();

    expect(h.remaining()).toHaveLength(0);
  });

  it('says it in the singular for a single waiting turn', () => {
    // The count has to be read before the removals — see the note there.
    const h = fakeRuntime(['a']);
    const guard = mount(h.runtime);

    guard.interrupt();

    expect(h.remaining()).toHaveLength(0);
    expect(notifyWarning).toHaveBeenCalledWith(
      'Wartende Nachricht entfernt',
      expect.stringContaining('Rückfrage')
    );
  });

  it('leaves the queue alone until an interrupt arrives', () => {
    const h = fakeRuntime(['a']);
    mount(h.runtime);

    expect(h.remaining()).toHaveLength(1);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('stays quiet when nothing is waiting', () => {
    const h = fakeRuntime([]);
    const guard = mount(h.runtime);

    guard.interrupt();

    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('stops listening once the surface unmounts', () => {
    const h = fakeRuntime(['a']);
    const guard = mount(h.runtime);

    guard.unmount();
    guard.interrupt();

    expect(h.remaining()).toHaveLength(1);
  });
});

describe('useInterruptSignal', () => {
  it('keeps one signal across re-renders, so the adapter memo is not rebuilt', () => {
    const seen: unknown[] = [];

    function Harness() {
      seen.push(useInterruptSignal());
      return null;
    }

    const view = render(<Harness />);
    view.rerender(<Harness />);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
