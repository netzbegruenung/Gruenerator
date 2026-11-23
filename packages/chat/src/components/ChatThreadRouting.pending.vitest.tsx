/**
 * A deep link must not leave the composer on the blank draft while the linked
 * thread is still opening (#5701).
 *
 * Until `switchToThread` settles, main is the draft the runtime booted on. A
 * message sent in that window minted a new thread; the switch then landed on
 * the linked one anyway, and the new thread's late `mintThreadFromDraft` left
 * `currentThreadId` (title, regenerate rights) pointing at the other thread.
 */
import { useAui, type AssistantClient } from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrueneratorChatRuntimeProvider } from '../runtime/GrueneratorChatRuntime';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { ChatThreadRouting } from './ChatThreadRouting';

vi.mock('../hooks/useChatCollaboration', () => ({
  useChatCollaboration: () => ({
    provider: null,
    typingUsers: [],
    setTyping: () => {},
    broadcastNewMessage: () => {},
  }),
}));

const OPEN_ID = '969c18a6-73e3-4751-8ddf-0e5ed3f0afa4';

function makeFetch(listGate: Promise<void>) {
  const threads = [
    {
      id: OPEN_ID,
      title: 'Radweg Hauptstraße',
      slugSuffix: 'F46YYy',
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
  return async (url: string) => {
    if (url.split('?')[0] === '/api/chat-service/threads') {
      await listGate;
      return json(threads);
    }
    if (url.startsWith('/api/chat-service/messages')) return json([]);
    if (url.includes('/tabular-files')) return json({ files: [] });
    if (url.includes('/summarize')) {
      return json({ compactionState: { summary: null }, messageCount: 0, needsCompaction: false });
    }
    return json({});
  };
}

const auiBox: { current: AssistantClient | null } = { current: null };
function AuiExpose() {
  const aui = useAui();
  useEffect(() => {
    auiBox.current = aui;
  }, [aui]);
  return null;
}

function Host({ slug }: { slug: string | null }) {
  return (
    <GrueneratorChatRuntimeProvider userId="u1" activePath={slug ? `/chat/${slug}` : '/chat'}>
      <AuiExpose />
      <ChatThreadRouting
        threadSlug={slug}
        onNavigateToThread={() => {}}
        onThreadGone={() => {}}
        onLeaveThread={() => {}}
        onOpenNotebookThread={() => {}}
      />
    </GrueneratorChatRuntimeProvider>
  );
}

function mainRemoteId() {
  const state = auiBox.current!.threads().getState();
  return state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
}

const pending = () => useAgentStore.getState().threadRoutePending;

afterEach(() => {
  useAgentStore.getState().setThreadRoutePending(false);
});

describe('ChatThreadRouting — threadRoutePending (#5701)', () => {
  it('holds the flag from the deep link until the linked thread is main', async () => {
    let releaseList!: () => void;
    const listGate = new Promise<void>((r) => (releaseList = r));
    useChatConfigStore
      .getState()
      .configure({ fetch: makeFetch(listGate), onUnauthorized: () => {} });

    // An old slug of the renamed thread: only the suffix has to resolve.
    render(<Host slug="nenne-in-zwei-saetzen-drei-F46YYy" />);
    await waitFor(() => expect(auiBox.current).not.toBeNull());

    expect(pending(), 'composer would send into the boot draft').toBe(true);
    expect(mainRemoteId()).toBeNull();

    await act(async () => {
      releaseList();
    });
    await waitFor(() => expect(mainRemoteId()).toBe(OPEN_ID));
    await waitFor(() => expect(pending()).toBe(false));
  });

  it('clears the flag when the route leaves before the thread opened', async () => {
    const listGate = new Promise<void>(() => {});
    useChatConfigStore
      .getState()
      .configure({ fetch: makeFetch(listGate), onUnauthorized: () => {} });

    const { rerender, unmount } = render(<Host slug="radweg-hauptstrasse-F46YYy" />);
    await waitFor(() => expect(pending()).toBe(true));

    rerender(<Host slug={null} />);
    expect(pending(), 'bare /chat is the draft — nothing to wait for').toBe(false);

    rerender(<Host slug="radweg-hauptstrasse-F46YYy" />);
    expect(pending()).toBe(true);
    unmount();
    expect(pending(), 'a flag left set would lock every other composer').toBe(false);
  });
});
