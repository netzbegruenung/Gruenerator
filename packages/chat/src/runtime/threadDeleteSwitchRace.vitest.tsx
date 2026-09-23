/**
 * Deleting a thread whose switch is still opening it (GlitchTip #566).
 *
 * For an archived thread the switch is suspended in `await unarchive(...)` —
 * BEFORE it assigns the main thread — so the delete's "main is a different
 * thread" check (which only inspects the CURRENT main) skips its move, and the
 * switch then completes against the slot delete()'s optimistic update just
 * hid. Every subsequent `item("main")` render throws
 * `useClientLookup: key "__LOCALID_…" not found`.
 *
 * The app-side guard (useSafeThreadAction('delete') in ThreadListItem.tsx)
 * parks on a new thread before the delete when the URL still names the clicked
 * thread. That bumps the switch generation, so the in-flight switch dies at
 * its generation check instead of claiming the deleted slot. This test
 * reproduces the race against the real
 * RemoteThreadListThreadListRuntimeCore and asserts the guard's outcome:
 * after the delete, the main thread is a live slot, not a dangling key.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
} from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

interface FakeThread {
  remoteId: string;
  status: 'regular' | 'archived';
  title?: string;
}

/** A thread-list adapter whose `unarchive` hangs on a manual gate — that gate
 *  IS the race window the switch suspends in. */
function makeGatedThreadList(threads: FakeThread[]) {
  const list: FakeThread[] = threads.map((t) => ({ ...t }));
  let releaseUnarchive!: () => void;
  const unarchiveGate = new Promise<void>((resolve) => {
    releaseUnarchive = resolve;
  });
  let unarchiveInFlight = false;

  const adapter: RemoteThreadListAdapter = {
    async list() {
      return { threads: list.map((t) => ({ ...t })) };
    },
    async fetch(id: string) {
      const t = list.find((x) => x.remoteId === id);
      if (!t) throw new Error(`Thread ${id} not found`);
      return { ...t };
    },
    async initialize() {
      return { remoteId: 'minted-thread' };
    },
    async rename() {},
    async archive(id: string) {
      const t = list.find((x) => x.remoteId === id);
      if (t) t.status = 'archived';
    },
    async unarchive(id: string) {
      unarchiveInFlight = true;
      await unarchiveGate;
      const t = list.find((x) => x.remoteId === id);
      if (t) t.status = 'regular';
    },
    async delete(id: string) {
      const i = list.findIndex((x) => x.remoteId === id);
      if (i !== -1) list.splice(i, 1);
    },
    async generateTitle() {
      throw new Error('generateTitle is not used by this test');
    },
  };

  return { adapter, inFlightUnarchive: () => unarchiveInFlight, releaseUnarchive };
}

const modelAdapter: ChatModelAdapter = {
  async *run() {
    yield { content: [{ type: 'text', text: 'Antwort' }] };
  },
};

function useTestThreadRuntime() {
  return useLocalRuntime(modelAdapter);
}

function mountRuntime(adapter: RemoteThreadListAdapter) {
  const box: { current: AssistantRuntime | null } = { current: null };

  function Harness() {
    const runtime = useRemoteThreadListRuntime({
      runtimeHook: useTestThreadRuntime,
      adapter,
    });
    useEffect(() => {
      box.current = runtime;
    }, [runtime]);
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <div />
      </AssistantRuntimeProvider>
    );
  }

  render(<Harness />);
  const runtime = box.current;
  if (!runtime) throw new Error('runtime not mounted');
  return runtime;
}

describe('delete racing an in-flight switch (GlitchTip #566)', () => {
  it('leaves the main thread on a live slot when the delete parks on a new thread first', async () => {
    const gated = makeGatedThreadList([
      { remoteId: 'archived-thread', status: 'archived', title: 'Alt' },
      { remoteId: 'regular-thread', status: 'regular', title: 'Neu' },
    ]);
    const runtime = mountRuntime(gated.adapter);
    // The public list client has no delete; the primitive's item client
    // delegates to the core, which the test reaches through the same
    // (untyped) property.
    const core = (
      runtime.threads as unknown as { _core: { delete: (id: string) => Promise<unknown> } }
    )._core;

    // Initial list load: the archived thread must be known.
    await waitFor(() => {
      expect(runtime.threads.getState().archivedThreadIds).toContain('archived-thread');
    });

    // 1. Open the archived thread — a sidebar click (URL-driven in the app,
    //    a direct switch here). Not awaited: the switch suspends in unarchive.
    let switchPromise: Promise<void> | undefined;
    await act(async () => {
      switchPromise = runtime.threads.switchToThread('archived-thread');
    });
    if (!switchPromise) throw new Error('switch not started');

    // 2. Wait for the switch to enter the race window: adapter.unarchive in
    //    flight, main thread not yet assigned.
    await waitFor(() => expect(gated.inFlightUnarchive()).toBe(true), { timeout: 5000 });

    // 3. The guarded delete — exactly what useSafeThreadAction('delete') does
    //    while the URL still names the clicked thread: park on a new thread
    //    (bumps the switch generation), then delete.
    await act(async () => {
      await runtime.threads.switchToNewThread();
      await core.delete('archived-thread');
    });

    // 4. Let the in-flight switch resume. Without the guard it would claim the
    //    deleted slot as main; with it, it dies at its generation check.
    await act(async () => {
      gated.releaseUnarchive();
      await switchPromise;
    });

    const state = runtime.threads.getState();
    // The crash condition: main points at a slot whose data no longer exists.
    const mainSlot = state.threadItems[state.mainThreadId];
    expect(mainSlot, 'dangling mainThreadId = the GlitchTip #566 crash').toBeDefined();
    expect(mainSlot?.id).toBe(state.mainThreadId);
    expect(mainSlot?.status).not.toBe('deleted');
    // The deleted thread is gone from the lists entirely.
    expect(state.threadIds).not.toContain('archived-thread');
    expect(state.archivedThreadIds).not.toContain('archived-thread');
  });
});
