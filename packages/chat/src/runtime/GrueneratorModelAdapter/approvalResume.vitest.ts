/**
 * Nach einer Werkzeug-Freigabe kann die Fortsetzung selbst auf ein
 * Browser-Werkzeug laufen: `tabelle_auswerten` braucht die Freigabe, und der
 * Server antwortet im selben Strom mit `interrupt{client_tool, run_python}`.
 * Ohne Ausführung im Freigabe-Zweig bliebe der Zug dort stehen — kein Code
 * läuft, keine Antwort kommt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { createGrueneratorModelAdapter } from './index';

import type { GrueneratorAdapterConfig } from './types';
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';

const runPython = vi.fn(async (_args: Record<string, unknown>) => ({ ergebnis: 42 }));

vi.mock('../clientTools', () => ({
  getClientToolExecutor: (name: string) => (name === 'run_python' ? runPython : null),
  getAvailableClientTools: () => ['run_python'],
}));

const THREAD_ID = 'e4d1c0aa-0000-4000-8000-000000005005';

type SseEvent = { event: string; data: unknown };

function sseBody(events: SseEvent[]): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

const config: GrueneratorAdapterConfig = {
  agentId: null,
  modelId: 'mistral-medium-2604',
  enabledTools: {} as GrueneratorAdapterConfig['enabledTools'],
  threadId: THREAD_ID,
};

/** Die pausierte Nachricht mit einer erlaubten Freigabe für `tabelle_auswerten`. */
const approvedMessage = {
  role: 'assistant',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-tabelle-1',
      toolName: 'tabelle_auswerten',
      args: { auftrag: 'Summe je Kreisverband', modus: 'auswerten' },
      argsText: '{}',
      approval: { id: 'call-tabelle-1', approved: true, optionId: 'allow-once' },
    },
  ],
};

const options = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Werte die Tabelle aus' }] }],
  abortSignal: new AbortController().signal,
  unstable_getMessage: () => approvedMessage,
} as unknown as ChatModelRunOptions;

async function drain(adapter: ChatModelAdapter): Promise<void> {
  const stream = adapter.run(options) as AsyncGenerator<ChatModelRunResult, void>;
  for await (const _ of stream) {
    // nur die Seiteneffekte zählen
  }
}

describe('approval resume runs client tools', () => {
  beforeEach(() => {
    runPython.mockClear();
  });

  it('executes run_python and posts its result to /resume after the approval resume', async () => {
    const bodies: unknown[] = [];
    let call = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      call++;
      const events: SseEvent[] =
        call === 1
          ? [
              {
                event: 'interrupt',
                data: {
                  interruptType: 'client_tool',
                  toolName: 'run_python',
                  args: { code: 'print(1)' },
                  threadId: THREAD_ID,
                },
              },
              { event: 'done', data: { interrupted: true } },
            ]
          : [
              { event: 'text_delta', data: { text: 'Fertig.' } },
              { event: 'done', data: { citations: [] } },
            ];
      return new Response(sseBody(events), { status: 200 });
    });
    useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });

    await drain(createGrueneratorModelAdapter(() => config, {}));

    expect(runPython).toHaveBeenCalledWith({ code: 'print(1)' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toMatchObject({ threadId: THREAD_ID, toolApprovals: [{ approved: true }] });
    expect(bodies[1]).toEqual({
      threadId: THREAD_ID,
      toolName: 'run_python',
      result: { ergebnis: 42 },
    });
  });
});
