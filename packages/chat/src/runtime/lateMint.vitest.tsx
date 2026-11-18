/**
 * #5719 — a draft's first send creates its thread lazily (`initialize()` →
 * POST /threads). If the user opens another thread while that POST is in
 * flight, the late answer must neither re-point the store mirror
 * (`currentThreadId`, title, compaction, interpreter files) at the new thread,
 * nor lose the new thread as the binding of the run that is still sending.
 */
import { useAui, type AssistantClient } from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { auiPromise } from '../lib/auiAsync';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { GrueneratorChatRuntimeProvider } from './GrueneratorChatRuntime';

vi.mock('../hooks/useChatCollaboration', () => ({
  useChatCollaboration: () => ({
    provider: null,
    typingUsers: [],
    setTyping: () => {},
    broadcastNewMessage: () => {},
  }),
}));

const OTHER_ID = '969c18a6-73e3-4751-8ddf-0e5ed3f0afa4';
const MINTED_ID = 'cfc62dd2-97d3-4cd9-aef2-d0cb048b1861';

function makeFetch(createGate: Promise<void>, sentThreadIds: unknown[]) {
  const threads = [
    {
      id: OTHER_ID,
      title: 'Teamchat',
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
  return async (url: string, init?: RequestInit) => {
    if (url === '/api/chat-service/threads' && init?.method === 'POST') {
      await createGate;
      return json({ id: MINTED_ID, slugSuffix: 'Mint01' });
    }
    if (url === '/api/chat-service/threads') return json(threads);
    if (url.startsWith('/api/chat-service/messages')) return json([]);
    if (url.includes('/tabular-files')) return json({ files: [] });
    if (url.includes('/summarize')) {
      return json({ compactionState: { summary: null }, messageCount: 0, needsCompaction: false });
    }
    if (init?.method === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as { threadId?: unknown };
        if ('threadId' in body) sentThreadIds.push(body.threadId);
      } catch {
        // not JSON
      }
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

function mainRemoteId() {
  const state = auiBox.current!.threads().getState();
  return state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
}

describe('late thread mint after main moved on (#5719)', () => {
  it('keeps the store on the opened thread and the run on the minted one', async () => {
    let releaseCreate!: () => void;
    const createGate = new Promise<void>((r) => (releaseCreate = r));
    const sentThreadIds: unknown[] = [];
    useChatConfigStore
      .getState()
      .configure({ fetch: makeFetch(createGate, sentThreadIds), onUnauthorized: () => {} });

    render(
      <GrueneratorChatRuntimeProvider userId="u1" activePath="/chat">
        <AuiExpose />
      </GrueneratorChatRuntimeProvider>
    );
    await waitFor(() => expect(auiBox.current).not.toBeNull());
    await act(async () => {
      await auiBox.current!.threads().getLoadThreadsPromise();
    });

    // First send on the draft: initialize() posts and waits at the gate.
    act(() => {
      auiBox.current!.thread().append({
        role: 'user',
        content: [{ type: 'text', text: 'Welcher Anteil der Radfahrenden' }],
      });
    });
    // Sidebar click while the POST is in flight.
    await act(async () => {
      await auiPromise(auiBox.current!.threads().switchToThread(OTHER_ID));
    });
    expect(mainRemoteId()).toBe(OTHER_ID);
    expect(useAgentStore.getState().currentThreadId).toBe(OTHER_ID);

    await act(async () => {
      releaseCreate();
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(mainRemoteId()).toBe(OTHER_ID);
    expect(
      useAgentStore.getState().currentThreadId,
      'late mint re-pointed the store at the thread the user left'
    ).toBe(OTHER_ID);
    await waitFor(() => expect(sentThreadIds).toContain(MINTED_ID));
    expect(sentThreadIds, 'the draft run was sent into the opened thread').not.toContain(OTHER_ID);
  });

  it('still mints into the store when the draft stays open', async () => {
    const sentThreadIds: unknown[] = [];
    useChatConfigStore
      .getState()
      .configure({ fetch: makeFetch(Promise.resolve(), sentThreadIds), onUnauthorized: () => {} });
    useAgentStore.getState().setCurrentThread(null);

    render(
      <GrueneratorChatRuntimeProvider userId="u1" activePath="/chat">
        <AuiExpose />
      </GrueneratorChatRuntimeProvider>
    );
    await waitFor(() => expect(auiBox.current).not.toBeNull());
    await act(async () => {
      await auiBox.current!.threads().getLoadThreadsPromise();
    });
    // A pinned connector survives only a mint, not a plain thread switch.
    useAgentStore.getState().setPinnedConnector({ id: 'tally', label: 'Tally' });

    act(() => {
      auiBox.current!.thread().append({
        role: 'user',
        content: [{ type: 'text', text: 'Hallo' }],
      });
    });

    await waitFor(() => expect(useAgentStore.getState().currentThreadId).toBe(MINTED_ID));
    expect(
      useAgentStore.getState().pinnedConnector,
      'went through setCurrentThread'
    ).not.toBeNull();
    await waitFor(() => expect(sentThreadIds).toContain(MINTED_ID));
  });
});
