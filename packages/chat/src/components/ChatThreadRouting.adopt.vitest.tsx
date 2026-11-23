/**
 * Sending from /start hands the running thread to bare /chat.
 *
 * The /start composer sends into the hoisted runtime before /chat (and with it
 * ChatThreadRouting) mounts. By the time the router runs, main carries the
 * freshly minted remoteId — and bare /chat means "no thread", so the router
 * parked on a fresh draft: the message the user had just sent vanished behind
 * an empty page. `adoptOpenThread` tells it to keep main and claim the URL.
 */
import { useAui, type AssistantClient } from '@assistant-ui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { GrueneratorChatRuntimeProvider } from '../runtime/GrueneratorChatRuntime';
import { useChatConfigStore } from '../stores/chatConfigStore';

import { ChatThreadRouting } from './ChatThreadRouting';

vi.mock('../hooks/useChatCollaboration', () => ({
  useChatCollaboration: () => ({
    provider: null,
    typingUsers: [],
    setTyping: () => {},
    broadcastNewMessage: () => {},
  }),
}));

const MINTED_ID = '5b0e7a1c-2f4d-4e8a-9c3b-7d6e5f4a3b2c';

function makeFetch() {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  return async (url: string, init?: RequestInit) => {
    if (url === '/api/chat-service/threads' && init?.method === 'POST') {
      return json({ id: MINTED_ID, slugSuffix: 'WehrPf' });
    }
    if (url.split('?')[0] === '/api/chat-service/threads') return json([]);
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

const routerBox: { mount: (() => void) | null } = { mount: null };

/** Starts on /start (no router mounted); `routerBox.mount()` hops to /chat. */
function Host({ adopt }: { adopt: boolean }) {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    routerBox.mount = () => setPath('/chat');
  }, []);
  const threadSlug = path?.startsWith('/chat/') ? path.slice('/chat/'.length) : null;
  const toThread = useCallback((slug: string) => setPath(`/chat/${slug}`), []);
  const toChat = useCallback(() => setPath('/chat'), []);
  return (
    <GrueneratorChatRuntimeProvider userId="u1" activePath={path ?? '/start'}>
      <AuiExpose />
      {path && (
        <ChatThreadRouting
          threadSlug={threadSlug}
          onNavigateToThread={toThread}
          onThreadGone={toChat}
          onLeaveThread={toChat}
          onOpenNotebookThread={setPath}
          // Router state lives only on the bare hop; the replace drops it.
          adoptOpenThread={adopt && threadSlug === null}
        />
      )}
      <div data-testid="path">{path ?? '/start'}</div>
    </GrueneratorChatRuntimeProvider>
  );
}

function mainRemoteId() {
  const state = auiBox.current!.threads().getState();
  return state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
}

async function sendOnStartThenOpenChat(adopt: boolean) {
  useChatConfigStore.getState().configure({ fetch: makeFetch(), onUnauthorized: () => {} });
  render(<Host adopt={adopt} />);
  await waitFor(() => expect(auiBox.current).not.toBeNull());
  await act(async () => {
    await auiBox.current!.threads().getLoadThreadsPromise();
  });

  act(() => {
    auiBox.current!.thread().append({
      role: 'user',
      content: [{ type: 'text', text: 'Was haben die Grünen zur Wehrpflicht gesagt?' }],
    });
  });
  // The order seen on prod: the mint is reported before the lazy /chat chunk
  // has mounted the router.
  await waitFor(() => expect(mainRemoteId()).toBe(MINTED_ID));

  act(() => routerBox.mount!());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });
}

describe('ChatThreadRouting — adopting the thread sent from /start', () => {
  it('keeps the sent thread and gives it its URL', async () => {
    await sendOnStartThenOpenChat(true);

    expect(mainRemoteId(), 'parked on a draft — the sent message is gone').toBe(MINTED_ID);
    await waitFor(() => expect(screen.getByTestId('path').textContent).toMatch(/WehrPf$/));
  });

  it('without the hand-over, bare /chat still starts a new chat', async () => {
    await sendOnStartThenOpenChat(false);

    expect(mainRemoteId()).toBeNull();
    expect(screen.getByTestId('path').textContent).toBe('/chat');
  });
});
