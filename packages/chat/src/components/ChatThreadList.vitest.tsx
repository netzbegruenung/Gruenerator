/**
 * The sidebar renders one page of threads, not the whole account (#4379):
 * 2109 rows put ~19k DOM nodes on every page that shows the sidebar.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
} from '@assistant-ui/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatThreadList, THREAD_PAGE_SIZE } from './ChatThreadList';

const THREAD_COUNT = THREAD_PAGE_SIZE * 2 + 7;

const adapter: RemoteThreadListAdapter = {
  async list() {
    return {
      threads: Array.from({ length: THREAD_COUNT }, (_, i) => ({
        remoteId: `t-${i}`,
        status: 'regular' as const,
        title: `Thread ${i}`,
      })),
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
  it('renders one page and grows by a page on "Mehr anzeigen"', async () => {
    render(<Harness />);

    await waitFor(() => expect(rowCount()).toBe(THREAD_PAGE_SIZE));
    expect(screen.getByText('Thread 0')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mehr anzeigen' })));
    expect(rowCount()).toBe(THREAD_PAGE_SIZE * 2);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mehr anzeigen' })));
    expect(rowCount()).toBe(THREAD_COUNT);
    expect(screen.queryByRole('button', { name: 'Mehr anzeigen' })).toBeNull();
  });
});
