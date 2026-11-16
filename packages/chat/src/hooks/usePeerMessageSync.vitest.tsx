/**
 * Peer sync against the REAL assistant-ui runtime and a fake awareness: the
 * runtime owns what "running" means and what `import`/`resumeRun` do to the
 * message list, so a mock runtime could not see a duplicated message.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { usePeerMessageSync } from './usePeerMessageSync';

import type { HocuspocusProvider } from '@hocuspocus/provider';

const THREAD = 't-1';

type Listener = () => void;
function makeAwareness() {
  const states = new Map<number, Record<string, unknown>>();
  const listeners = new Set<Listener>();
  return {
    clientID: 1,
    getStates: () => states,
    on: (_: string, l: Listener) => listeners.add(l),
    off: (_: string, l: Listener) => listeners.delete(l),
    peer(patch: Record<string, unknown>) {
      states.set(2, { ...(states.get(2) ?? {}), ...patch });
      listeners.forEach((l) => l());
    },
  };
}

const USER_ROW = { id: 'u1', role: 'user', content: 'Frage' };
const LIVE_ROW = { id: 'stream-1', role: 'assistant', content: 'Teil', metadata: { live: true } };
const DONE_ROW = { id: 'stream-1', role: 'assistant', content: 'Teil und Rest' };

function sse(events: Array<{ event: string; data: unknown }>) {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

/** `rows` is read per call so a test can flip the thread from live to finished. */
function serve(getRows: () => unknown[], streamGate?: Promise<void>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/streams/') || url.includes('stream-1')) {
      if (streamGate) await streamGate;
      return new Response(
        sse([
          { event: 'stream_started', data: { streamId: 'stream-1' } },
          { event: 'text_delta', data: { text: 'Teil und Rest' } },
          { event: 'done', data: { threadId: THREAD } },
        ]),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify(getRows()), { status: 200 });
  });
  useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });
  return fetchMock;
}

function mount(collabOverrides: Partial<{ broadcastTurnStarted: () => void }> = {}) {
  const awareness = makeAwareness();
  const broadcastNewMessage = vi.fn();
  const broadcastTurnStarted = collabOverrides.broadcastTurnStarted ?? vi.fn();
  const box: { runtime: AssistantRuntime | null } = { runtime: null };
  const adapter: ChatModelAdapter = {
    async *run() {
      yield { content: [{ type: 'text' as const, text: 'lokal' }] };
    },
  };
  const provider = { awareness } as unknown as HocuspocusProvider;

  function Sync({ runtime }: { runtime: AssistantRuntime }) {
    box.runtime = runtime;
    usePeerMessageSync({
      threadId: THREAD,
      runtime,
      collab: { provider, broadcastNewMessage, broadcastTurnStarted },
    });
    return null;
  }
  function Harness() {
    const runtime = useLocalRuntime(adapter);
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <Sync runtime={runtime} />
      </AssistantRuntimeProvider>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  const thread = () => box.runtime!.thread;
  const texts = () =>
    thread()
      .getState()
      .messages.map((m) => m.content.map((p) => (p.type === 'text' ? p.text : '')).join(''));
  return { awareness, broadcastNewMessage, broadcastTurnStarted, thread, texts, box };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('usePeerMessageSync', () => {
  it('a peer chatNewMessage tick fetches once and imports the rows', async () => {
    const fetchMock = serve(() => [USER_ROW, DONE_ROW]);
    const { awareness, texts } = mount();
    act(() => awareness.peer({ chatNewMessage: { t: 1 } }));
    await waitFor(() => expect(texts()).toEqual(['Frage', 'Teil und Rest']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-attaches a live peer turn as a running message and finishes without duplicating it', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let rows: unknown[] = [USER_ROW, LIVE_ROW];
    const fetchMock = serve(() => rows, gate);
    const { awareness, thread, texts, broadcastNewMessage } = mount();

    act(() => awareness.peer({ chatTurnStarted: { t: 1 } }));
    await waitFor(() => expect(thread().getState().isRunning).toBe(true));
    // The live row is not imported as a finished message next to its replay.
    expect(texts()).toEqual(['Frage', '']);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('stream-1'))).toBe(true);

    rows = [USER_ROW, DONE_ROW];
    release();
    await waitFor(() => expect(thread().getState().isRunning).toBe(false));
    await waitFor(() => expect(texts()).toEqual(['Frage', 'Teil und Rest']));
    // A peer-driven run does not echo a broadcast back at the room.
    expect(broadcastNewMessage).not.toHaveBeenCalled();
  });

  it('the next chatNewMessage after the re-attach does not duplicate the message', async () => {
    let rows: unknown[] = [USER_ROW, LIVE_ROW];
    let release: () => void = () => {};
    serve(() => rows, new Promise<void>((r) => (release = r)));
    const { awareness, thread, texts } = mount();
    act(() => awareness.peer({ chatTurnStarted: { t: 1 } }));
    await waitFor(() => expect(thread().getState().isRunning).toBe(true));
    release();
    await waitFor(() => expect(thread().getState().isRunning).toBe(false));
    // The canonical refresh at the end of the run still sees the unfinalized
    // row: what was streamed stays.
    await act(async () => {});
    expect(texts()).toEqual(['Frage', 'Teil und Rest']);

    rows = [USER_ROW, DONE_ROW];
    act(() => awareness.peer({ chatNewMessage: { t: 2 } }));
    await waitFor(() => expect(texts()).toEqual(['Frage', 'Teil und Rest']));
    await act(async () => {});
    expect(texts()).toEqual(['Frage', 'Teil und Rest']);
    expect(thread().getState().messages).toHaveLength(2);
  });

  it('does not import while the local runtime is running, and catches up at idle', async () => {
    const fetchMock = serve(() => [USER_ROW, DONE_ROW]);
    const { awareness, thread, texts } = mount();
    // A local run in flight.
    let finish: () => void = () => {};
    const hold = new Promise<void>((r) => (finish = r));
    useChatConfigStore.setState({
      fetch: vi.fn(async () => {
        await hold;
        return new Response('[]');
      }) as unknown as typeof fetch,
    });
    await act(async () => {
      thread().resumeRun({
        parentId: null,
        stream: async function* () {
          await hold;
          yield { content: [{ type: 'text' as const, text: 'lokal' }] };
        },
      });
    });
    await waitFor(() => expect(thread().getState().isRunning).toBe(true));
    useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });

    act(() => awareness.peer({ chatNewMessage: { t: 1 } }));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(texts()).toEqual(['Frage', 'Teil und Rest']));
  });

  it('broadcasts turn start and end for a local run', async () => {
    serve(() => []);
    const { thread, broadcastNewMessage, broadcastTurnStarted, box } = mount();
    await waitFor(() => expect(box.runtime).not.toBeNull());
    await act(async () => {
      thread().append('Hallo');
    });
    await waitFor(() => expect(broadcastNewMessage).toHaveBeenCalledTimes(1));
    expect(broadcastTurnStarted).toHaveBeenCalledTimes(1);
  });
});
