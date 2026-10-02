/**
 * The URL → thread effect must answer URL changes only (GlitchTip #671).
 *
 * `useAui()` hands out a new client whenever the main thread changes. While
 * that client was an effect dependency, a runtime-initiated move off the open
 * thread (the delete guard parking on a draft) re-ran the effect with the URL
 * that still named the thread being left — and it switched straight back. In
 * the delete flow that switch lands after delete()'s optimistic update, main
 * then names a removed slot, and every render throws
 * `useClientLookup: key "<remoteId>" not found`.
 */
import { ThreadListPrimitive, useAui, type AssistantClient } from '@assistant-ui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { auiPromise } from '../lib/auiAsync';
import { GrueneratorChatRuntimeProvider } from '../runtime/GrueneratorChatRuntime';
import { useChatConfigStore } from '../stores/chatConfigStore';

import { ChatThreadRouting } from './ChatThreadRouting';
import { GrueneratorThreadListItem } from './thread/ThreadListItem';

// Opening a thread would otherwise connect a real HocuspocusProvider to
// ws://localhost:1240. With a local Hocuspocus running, undici's WebSocket then
// rejects jsdom's Event and the run ends with two unhandled errors.
vi.mock('../hooks/useChatCollaboration', () => ({
  useChatCollaboration: () => ({
    provider: null,
    typingUsers: [],
    setTyping: () => {},
    broadcastNewMessage: () => {},
  }),
}));

const OPEN_ID = '969c18a6-73e3-4751-8ddf-0e5ed3f0afa4';

function makeFetch() {
  const threads = [
    {
      id: OPEN_ID,
      title: 'Einfache Sprache',
      slugSuffix: 'jjRBTz',
      agentId: 'gruenerator-universal',
      threadType: 'chat',
      status: 'regular',
      lastMessage: 'x',
      accessType: 'owner',
      updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  return async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      threads.splice(0, threads.length);
      return json({ success: true, trashed: true });
    }
    if (url === '/api/chat-service/threads') return json(threads);
    if (url.startsWith('/api/chat-service/messages')) return json([]);
    if (url.includes('/tabular-files')) return json({ files: [] });
    if (url.includes('/summarize')) {
      return json({ compactionState: { summary: null }, messageCount: 0, needsCompaction: false });
    }
    return json({});
  };
}

class Catcher extends Component<{ errors: unknown[]; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.errors.push(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const auiBox: { current: AssistantClient | null } = { current: null };

function AuiExpose() {
  const aui = useAui();
  useEffect(() => {
    auiBox.current = aui;
  }, [aui]);
  return null;
}

/** Leaving a thread does not touch the URL when `freezeOnLeave` is set. */
function Host({ freezeOnLeave }: { freezeOnLeave: boolean }) {
  const [path, setPath] = useState('/chat');
  const threadSlug = path.startsWith('/chat/') ? path.slice('/chat/'.length) : null;
  const toThread = useCallback((slug: string) => setPath(`/chat/${slug}`), []);
  const toChat = useCallback(() => {
    if (!freezeOnLeave) setPath('/chat');
  }, [freezeOnLeave]);
  return (
    <GrueneratorChatRuntimeProvider userId="u1" activePath={path} onNavigate={setPath}>
      <AuiExpose />
      <ChatThreadRouting
        threadSlug={threadSlug}
        onNavigateToThread={toThread}
        onThreadGone={toChat}
        onLeaveThread={toChat}
        onOpenNotebookThread={setPath}
      />
      <div data-testid="path">{path}</div>
      <nav data-testid="sidebar">
        <ThreadListPrimitive.Root>
          <ThreadListPrimitive.Items components={{ ThreadListItem: GrueneratorThreadListItem }} />
        </ThreadListPrimitive.Root>
      </nav>
    </GrueneratorChatRuntimeProvider>
  );
}

function mainRemoteId() {
  const state = auiBox.current!.threads().getState();
  return state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
}

async function settle(ms = 150) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function openThread(user: ReturnType<typeof userEvent.setup>) {
  const sidebar = await screen.findByTestId('sidebar');
  const title = await within(sidebar).findByText('Einfache Sprache');
  await user.click(title);
  await waitFor(() => expect(screen.getByTestId('path').textContent).toContain('jjRBTz'));
  await waitFor(() => expect(mainRemoteId()).toBe(OPEN_ID));
  await settle();
  return title;
}

describe('ChatThreadRouting — URL → thread (GlitchTip #671)', () => {
  it('does not re-open a thread the runtime left while the URL still names it', async () => {
    useChatConfigStore.getState().configure({ fetch: makeFetch(), onUnauthorized: () => {} });
    const user = userEvent.setup();
    render(<Host freezeOnLeave />);
    await openThread(user);

    // The runtime leaves the thread on its own, as the delete guard does.
    await act(async () => {
      await auiPromise(auiBox.current!.threads().switchToNewThread());
    });
    await settle();

    expect(screen.getByTestId('path').textContent).toContain('jjRBTz');
    expect(mainRemoteId(), 'the stale URL dragged main back to the left thread').toBeNull();
  });

  it('deletes the open thread from the sidebar without crashing the tree', async () => {
    useChatConfigStore.getState().configure({ fetch: makeFetch(), onUnauthorized: () => {} });
    const errors: unknown[] = [];
    const user = userEvent.setup();
    render(
      <Catcher errors={errors}>
        <Host freezeOnLeave={false} />
      </Catcher>
    );
    const title = await openThread(user);

    const row = title.closest('a')!.parentElement!;
    await user.click(within(row).getByLabelText('Mehr Optionen'));
    await user.click(await screen.findByText('Löschen'));
    await settle(300);

    expect(errors.map(String)).toEqual([]);
    expect(screen.getByTestId('path').textContent).toBe('/chat');
    expect(mainRemoteId()).toBeNull();
  });
});
