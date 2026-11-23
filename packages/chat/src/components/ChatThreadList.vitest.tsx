/**
 * The sidebar loads one page of threads at a time, not the whole account:
 * 2109 rows put ~19k DOM nodes on every page that shows the sidebar (#4379),
 * and a runtime holding thousands of threads made every keystroke in a composer
 * scan them all (#5987). The adapter pages by cursor; "Mehr anzeigen" calls the
 * runtime's loadMore.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
} from '@assistant-ui/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatThreadList } from './ChatThreadList';

const THREAD_PAGE_SIZE = 50;
const THREAD_COUNT = THREAD_PAGE_SIZE * 2 + 7;

const adapter: RemoteThreadListAdapter = {
  async list(params) {
    const start = params?.after ? Number(params.after) : 0;
    const end = Math.min(start + THREAD_PAGE_SIZE, THREAD_COUNT);
    return {
      threads: Array.from({ length: end - start }, (_, i) => ({
        remoteId: `t-${start + i}`,
        status: 'regular' as const,
        title: `Thread ${start + i}`,
      })),
      nextCursor: end < THREAD_COUNT ? String(end) : undefined,
    };
  },
  async fetch(id: string) {
    return { remoteId: id, status: 'regular' };
  },
  async initialize() {
    return { remoteId: 'minted-thread' };
  },
  async rename() {},
  async archive() {},
  async unarchive() {},
  async delete() {},
  async generateTitle() {
    throw new Error('unused');
  },
};

const modelAdapter: ChatModelAdapter = {
  async *run() {
    yield { content: [{ type: 'text', text: 'Antwort' }] };
  },
};

function useTestThreadRuntime() {
  return useLocalRuntime(modelAdapter);
}

function Harness() {
  const runtime = useRemoteThreadListRuntime({ runtimeHook: useTestThreadRuntime, adapter });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThreadList noScroll />
    </AssistantRuntimeProvider>
  );
}

const rowCount = () => screen.queryAllByText(/^Thread \d+$/).length;

describe('ChatThreadList paging', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one page and grows by a page on "Mehr anzeigen"', async () => {
    render(<Harness />);

    await waitFor(() => expect(rowCount()).toBe(THREAD_PAGE_SIZE));
    expect(screen.getByText('Thread 0')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mehr anzeigen' })));
    await waitFor(() => expect(rowCount()).toBe(THREAD_PAGE_SIZE * 2));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mehr anzeigen' })));
    await waitFor(() => expect(rowCount()).toBe(THREAD_COUNT));
    expect(screen.queryByRole('button', { name: 'Mehr anzeigen' })).toBeNull();
  });

  it('keeps loading while the button stays in view', async () => {
    // A tall sidebar: the button is in view after every page.
    class AlwaysVisibleObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() =>
          this.callback(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
        );
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', AlwaysVisibleObserver);

    render(<Harness />);

    await waitFor(() => expect(rowCount()).toBe(THREAD_COUNT));
    expect(screen.queryByRole('button', { name: 'Mehr anzeigen' })).toBeNull();
  });
});
