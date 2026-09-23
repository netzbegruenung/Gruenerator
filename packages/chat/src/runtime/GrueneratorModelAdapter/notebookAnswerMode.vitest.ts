/**
 * The notebook answer mode on the shared chat adapter — the path mobile's
 * notebook threads take (`/notebook/stream` via `effectiveMode === 'notebook'`).
 * Web's notebook page uses NotebookModelAdapter and is covered there.
 */
import {
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
} from '@assistant-ui/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { type GrueneratorAdapterConfig } from './types';

import { createGrueneratorModelAdapter } from './index';

const THREAD_ID = 'e4d1c0aa-0000-4000-8000-000000000043';

function respondWith(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(body));
  useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });
  return fetchMock;
}

const baseConfig: GrueneratorAdapterConfig = {
  agentId: null,
  modelId: 'mistral-medium-2604',
  enabledTools: {} as GrueneratorAdapterConfig['enabledTools'],
  threadId: THREAD_ID,
  selectedNotebookId: 'berlin-notebook',
  threadMode: 'notebook',
};

const history = [
  { role: 'user', content: [{ type: 'text', text: 'Liste alle Quellen' }] },
  {
    role: 'assistant',
    content: [{ type: 'text', text: '1. Programm' }],
    metadata: { custom: { answerMode: 'praezision', answerModeReason: 'pregate' } },
  },
  { role: 'user', content: [{ type: 'text', text: 'und die zweite?' }] },
];

async function runTurn(adapter: ChatModelAdapter): Promise<ChatModelRunResult | undefined> {
  const stream = adapter.run({
    messages: history,
    abortSignal: new AbortController().signal,
  } as unknown as ChatModelRunOptions) as AsyncGenerator<ChatModelRunResult, void>;
  let last: ChatModelRunResult | undefined;
  for await (const result of stream) last = result;
  return last;
}

function sentBody(fetchMock: ReturnType<typeof respondWith>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('adapter notebook answer mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the mode and the history, earlier answers carrying their mode', async () => {
    const fetchMock = respondWith([{ event: 'completion', data: { text: 'Die zweite …' } }]);

    await runTurn(
      createGrueneratorModelAdapter(() => ({ ...baseConfig, notebookAnswerMode: 'auto' }), {})
    );

    const body = sentBody(fetchMock);
    expect(body.answerMode).toBe('auto');
    expect(body.messages).toEqual([
      { role: 'user', content: 'Liste alle Quellen' },
      { role: 'assistant', content: '1. Programm', answerMode: 'praezision' },
      { role: 'user', content: 'und die zweite?' },
    ]);
  });

  it('omits the field without a mode (old request shape)', async () => {
    const fetchMock = respondWith([{ event: 'completion', data: { text: 'A' } }]);

    await runTurn(createGrueneratorModelAdapter(() => baseConfig, {}));

    expect(sentBody(fetchMock)).not.toHaveProperty('answerMode');
  });

  it('keeps answer modes out of a chat-mode request', async () => {
    const fetchMock = respondWith([
      { event: 'text_delta', data: { text: 'A' } },
      { event: 'done', data: { citations: [] } },
    ]);

    await runTurn(createGrueneratorModelAdapter(() => ({ ...baseConfig, threadMode: 'chat' }), {}));

    const messages = sentBody(fetchMock).messages as Array<Record<string, unknown>>;
    expect(messages.some((m) => 'answerMode' in m)).toBe(false);
  });

  it('stamps the streamed mode onto the answer', async () => {
    respondWith([
      {
        event: 'answer_mode',
        data: { requested: 'auto', resolved: 'praezision', reason: 'guard' },
      },
      { event: 'completion', data: { answer: 'B', text: 'B' } },
    ]);

    const last = await runTurn(
      createGrueneratorModelAdapter(() => ({ ...baseConfig, notebookAnswerMode: 'auto' }), {})
    );

    expect(last?.metadata?.custom).toMatchObject({
      answerMode: 'praezision',
      answerModeReason: 'guard',
    });
  });
});
