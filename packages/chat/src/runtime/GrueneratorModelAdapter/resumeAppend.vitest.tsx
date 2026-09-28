/**
 * A resumed turn against the real assistant-ui runtime (GlitchTip #660).
 *
 * `LocalThreadRuntimeCore.performRoundtrip` APPENDS whatever a resumed `run()`
 * yields to the paused message (`[...initialContent, ...m.content]`). A resume
 * that rebuilds a card the paused message already shows therefore produces two
 * parts with one `toolCallId`, and assistant-ui dies on the whole message with
 * "Duplicate key toolCallId-… in useResources". The adapter tests drive `run()`
 * alone and cannot see this — only the runtime does the appending.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
} from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { createGrueneratorModelAdapter } from './index';

import type { GrueneratorAdapterConfig } from './types';

const THREAD_ID = 'e4d1c0aa-0000-4000-8000-000000000660';

type SseEvent = { event: string; data: unknown };

function sseBody(events: SseEvent[]): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

/** First call answers the turn, every later call answers the resume. */
function serve(turn: SseEvent[], resume: SseEvent[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const events = url.includes('resume') ? resume : turn;
    return new Response(sseBody(events), { status: 200 });
  });
  useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });
  return fetchMock;
}

const config: GrueneratorAdapterConfig = {
  agentId: null,
  modelId: 'mistral-medium-2604',
  enabledTools: {} as GrueneratorAdapterConfig['enabledTools'],
  threadId: THREAD_ID,
};

function mountRuntime(): AssistantRuntime {
  const box: { current: AssistantRuntime | null } = { current: null };
  const adapter = createGrueneratorModelAdapter(() => config, {});

  function Harness() {
    const runtime = useLocalRuntime(adapter, { unstable_humanToolNames: ['ask_human'] });
    box.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <div />
      </AssistantRuntimeProvider>
    );
  }

  render(<Harness />);
  if (!box.current) throw new Error('runtime not mounted');
  return box.current;
}

function lastAssistant(runtime: AssistantRuntime) {
  const message = runtime.thread.getState().messages.at(-1);
  if (!message || message.role !== 'assistant') throw new Error('no assistant message');
  return message;
}

function toolCallIds(runtime: AssistantRuntime): string[] {
  return lastAssistant(runtime).content.flatMap((p) =>
    p.type === 'tool-call' ? [p.toolCallId] : []
  );
}

function text(runtime: AssistantRuntime): string {
  return lastAssistant(runtime)
    .content.map((p) => (p.type === 'text' ? p.text : ''))
    .join('');
}

async function send(runtime: AssistantRuntime, message: string) {
  await act(async () => {
    runtime.thread.composer.setText(message);
    runtime.thread.composer.send();
  });
  await waitFor(() => expect(runtime.thread.getState().isRunning).toBe(false));
}

const searchStep = (stepId: string): SseEvent[] => [
  { event: 'tool_step_start', data: { stepId, toolName: 'web_search', args: { query: 'Hunde' } } },
  {
    event: 'tool_step_result',
    data: { stepId, toolName: 'web_search', ok: true, result: { resultCount: 1 } },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resumed turn on the real runtime', () => {
  it('does not duplicate earlier cards when an ask_human answer resumes the turn', async () => {
    serve(
      [
        ...searchStep('chatcmpl-tool-search'),
        {
          event: 'thinking_step',
          data: {
            stepId: 'chatcmpl-tool-ask',
            toolName: 'ask_human',
            title: 'Stelle Klärungsfrage...',
            status: 'in_progress',
            args: { question: 'Welcher Name?', options: null },
          },
        },
        { event: 'interrupt', data: { interruptType: 'clarification', question: 'Welcher Name?' } },
        { event: 'done', data: { threadId: THREAD_ID, citations: [], interrupted: true } },
      ],
      [
        // The server re-emits the earlier step (clarificationResume.ts).
        ...searchStep('chatcmpl-tool-search'),
        { event: 'text_delta', data: { text: 'Danke, weiter geht es.' } },
        { event: 'done', data: { threadId: THREAD_ID, citations: [] } },
      ]
    );
    const runtime = mountRuntime();

    await send(runtime, 'Schreib eine Anfrage');
    expect(toolCallIds(runtime)).toEqual(['chatcmpl-tool-search', 'chatcmpl-tool-ask']);

    const messageId = lastAssistant(runtime).id;
    await act(async () => {
      runtime.thread
        .getMessageById(messageId)
        .getMessagePartByToolCallId('chatcmpl-tool-ask')
        .addToolResult('Bello');
    });
    await waitFor(() => expect(text(runtime)).toContain('Danke, weiter geht es.'));

    const ids = toolCallIds(runtime);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids.filter((id) => id === 'chatcmpl-tool-search')).toHaveLength(1);
  });

  it('does not duplicate cards when a tool approval resumes the turn', async () => {
    serve(
      [
        ...searchStep('chatcmpl-tool-search'),
        {
          event: 'interrupt',
          data: {
            interruptType: 'tool_approval',
            approvalTurnId: 'turn-1',
            calls: [{ toolCallId: 'chatcmpl-tool-mcp', toolName: 'mcp_create', args: { a: 1 } }],
          },
        },
        { event: 'done', data: { threadId: THREAD_ID, citations: [], interrupted: true } },
      ],
      [
        {
          event: 'tool_step_start',
          data: { stepId: 'chatcmpl-tool-mcp', toolName: 'mcp_create', args: { a: 1 } },
        },
        {
          event: 'tool_step_result',
          data: { stepId: 'chatcmpl-tool-mcp', toolName: 'mcp_create', ok: true, result: {} },
        },
        { event: 'text_delta', data: { text: 'Erledigt.' } },
        { event: 'done', data: { threadId: THREAD_ID, citations: [] } },
      ]
    );
    const runtime = mountRuntime();

    await send(runtime, 'Leg das an');
    expect(toolCallIds(runtime)).toEqual(['chatcmpl-tool-search', 'chatcmpl-tool-mcp']);

    const messageId = lastAssistant(runtime).id;
    await act(async () => {
      await runtime.thread
        .getMessageById(messageId)
        .getMessagePartByToolCallId('chatcmpl-tool-mcp')
        .respondToToolApproval({ approved: true });
    });
    await waitFor(() => expect(text(runtime)).toContain('Erledigt.'));

    const ids = toolCallIds(runtime);
    expect(ids).toEqual([...new Set(ids)]);
  });
});
