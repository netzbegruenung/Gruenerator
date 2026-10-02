/**
 * Ein Notebook-Chat fragt das Notebook — egal, welcher Agent woanders gewählt ist.
 *
 * Auf Mobile ging „Hitze" im Saarland-Notebook als Agent-Chat raus: der
 * Chat-Screen las Agent und Modus aus dem globalen Agent-Store, in dem die
 * Notebook-Seite noch den LV-Agenten stehen hatte. Mobile fährt seither diesen
 * Hook wie Web; er baut seine Anfrage aus den eigenen Optionen. Der Test hält
 * fest, dass ein im Store stehender Agent die Anfrage nicht erreicht.
 */
import { type ChatModelRunResult } from '@assistant-ui/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { useNotebookChatAdapter } from './useNotebookChatAdapter';

interface SentRequest {
  url: string;
  body: Record<string, unknown>;
}

function captureRequests(): SentRequest[] {
  const sent: SentRequest[] = [];
  useChatConfigStore.setState({
    fetch: async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `event: completion\ndata: ${JSON.stringify({ answer: 'ok', citations: [], sources: [], allSources: [] })}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(body, { status: 200 });
    },
  });
  return sent;
}

async function ask(adapter: ReturnType<typeof useNotebookChatAdapter>, text: string) {
  const stream = adapter.run({
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<ChatModelRunResult, void>;
  for await (const result of stream) void result;
}

beforeEach(() => {
  useAgentStore.setState({
    selectedAgentId: 'gruenerator-oeffentlichkeitsarbeit-saarland',
    threadMode: 'chat',
    selectedModel: 'gruenerator-ultra',
  });
});

describe('useNotebookChatAdapter', () => {
  it('asks the notebook stream for its collection, without the selected agent', async () => {
    const sent = captureRequests();
    const { result } = renderHook(() =>
      useNotebookChatAdapter({
        collections: [{ id: 'saarland-system', name: 'Saarland' }],
        answerMode: 'auto',
        magicSearch: true,
      })
    );

    await ask(result.current, 'Hitze');

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('/api/chat-service/notebook/stream');
    expect(sent[0]!.body.collectionId).toBe('saarland-system');
    expect(sent[0]!.body).not.toHaveProperty('agentId');
  });

  it('sends a recognised question as chat on the first turn (Magic Search)', async () => {
    const sent = captureRequests();
    const { result } = renderHook(() =>
      useNotebookChatAdapter({
        collections: [{ id: 'saarland-system', name: 'Saarland' }],
        answerMode: 'auto',
        magicSearch: true,
      })
    );

    await ask(result.current, 'Was tun die Grünen im Saarland gegen Hitze?');

    expect(sent[0]!.body.answerMode).toBe('chat');
  });
});
