/**
 * A deep link to a thread outside the loaded sidebar page must still open it
 * (#5987). The sidebar loads threads page by page, so the slug cache does not
 * know an older thread; the routing effect asks the server for it by slug, and
 * the runtime's fetch() resolves the id the same way.
 */
import { useAui, type AssistantClient } from '@assistant-ui/react';
import { render, waitFor } from '@testing-library/react';
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

const OLD_ID = '969c18a6-73e3-4751-8ddf-0e5ed3f0afa4';
const OLD_SLUG = 'jjRBTz';

const oldThread = {
  id: OLD_ID,
  title: 'Alter Chat',
  slugSuffix: OLD_SLUG,
  agentId: 'gruenerator-universal',
  threadType: 'chat',
  status: 'regular',
  lastMessage: 'x',
  accessType: 'owner',
  updatedAt: new Date(Date.now() - 86_400_000 * 90).toISOString(),
};

function makeFetch(urls: string[]) {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  return async (url: string) => {
    urls.push(url);
    if (url.startsWith('/api/chat-service/threads?')) {
      const q = new URLSearchParams(url.split('?')[1]);
      // The first page does not contain the old thread; only a targeted lookup does.
      if (q.get('slugSuffix') === OLD_SLUG || q.get('threadId') === OLD_ID)
        return json([oldThread]);
      return json([]);
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

function Host({ onGone }: { onGone: () => void }) {
  const [path, setPath] = useState(`/chat/alter-chat-${OLD_SLUG}`);
  const threadSlug = path.startsWith('/chat/') ? path.slice('/chat/'.length) : null;
  const toThread = useCallback((slug: string) => setPath(`/chat/${slug}`), []);
  return (
    <GrueneratorChatRuntimeProvider userId="u1" activePath={path} onNavigate={setPath}>
      <AuiExpose />
      <ChatThreadRouting
        threadSlug={threadSlug}
        onNavigateToThread={toThread}
        onThreadGone={onGone}
        onLeaveThread={() => {}}
        onOpenNotebookThread={setPath}
      />
    </GrueneratorChatRuntimeProvider>
  );
}

function mainRemoteId() {
  const state = auiBox.current?.threads().getState();
  return state?.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
}

describe('ChatThreadRouting — deep link beyond the loaded page', () => {
  it('opens a thread that the first page does not contain', async () => {
    const urls: string[] = [];
    useChatConfigStore.getState().configure({ fetch: makeFetch(urls), onUnauthorized: () => {} });
    const onGone = vi.fn();

    render(<Host onGone={onGone} />);

    await waitFor(() => expect(mainRemoteId()).toBe(OLD_ID));
    expect(onGone).not.toHaveBeenCalled();
    // The list was paged, never fetched whole, and the old thread was looked up
    // by slug.
    expect(urls.some((u) => u === '/api/chat-service/threads')).toBe(false);
    expect(urls.some((u) => u.includes(`slugSuffix=${OLD_SLUG}`))).toBe(true);
  });

  it('still sends the user away when the server has no such thread', async () => {
    useChatConfigStore.getState().configure({ fetch: makeFetch([]), onUnauthorized: () => {} });
    const onGone = vi.fn();
    function Gone() {
      const [path] = useState('/chat/nopeXX');
      return (
        <GrueneratorChatRuntimeProvider userId="u1" activePath={path} onNavigate={() => {}}>
          <ChatThreadRouting
            threadSlug="nopeXX"
            onNavigateToThread={() => {}}
            onThreadGone={onGone}
            onLeaveThread={() => {}}
            onOpenNotebookThread={() => {}}
          />
        </GrueneratorChatRuntimeProvider>
      );
    }

    render(<Gone />);

    await waitFor(() => expect(onGone).toHaveBeenCalled());
  });
});
