import { describe, expect, it, vi } from 'vitest';

import {
  NotebookLoopSSE,
  runNotebookPraezisionTurn,
  type NotebookPraezisionDeps,
} from './notebookPraezisionTurn.js';

import type { AgenticResponseOutcome } from './agenticLoop/agenticRespondService.js';
import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { Request, Response } from 'express';

const NB = '0b1c29c9-9823-4794-b1be-70a36f801791';

interface Sent {
  event: string;
  data: Record<string, unknown>;
}

function fakeSse(): { sse: SSEWriter; sent: Sent[] } {
  const sent: Sent[] = [];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => sent.push({ event, data }),
    sendRaw: (event: string, data: Record<string, unknown>) => sent.push({ event, data }),
    isEnded: () => false,
    end: vi.fn(),
    setTextListener: vi.fn(),
  } as unknown as SSEWriter;
  return { sse, sent };
}

const fakeRes = (destroyed = false): Response =>
  ({ on: vi.fn(), writableEnded: false, destroyed }) as unknown as Response;

function outcome(over: Partial<AgenticResponseOutcome> = {}): AgenticResponseOutcome {
  return {
    fullText: 'Im Notebook liegen 3 Quellen [1].',
    steps: [
      {
        toolCallId: 'c1',
        toolName: 'notebook_quellen',
        args: { action: 'list' },
        result: { total: 3 },
        textOffset: 0,
      },
    ],
    citations: [
      {
        id: 1,
        title: 'Antrag Radweg',
        url: '',
        snippet: 'Der Radweg kommt 2027.',
        source: 'Kreisverband',
        documentId: 'd1',
      },
    ],
    sources: [],
    modelName: 'mistral-medium-2604',
    ...over,
  };
}

function setup(
  opts: { outcome?: AgenticResponseOutcome; messages?: unknown[]; resDestroyed?: boolean } = {}
) {
  const { sse, sent } = fakeSse();
  const loopCalls: Array<Record<string, unknown>> = [];
  const deps: NotebookPraezisionDeps = {
    initializeChatState: vi.fn(
      async () =>
        ({
          intent: 'direct',
          agentConfig: { identifier: 'gruenerator-universal' },
          notebookIds: [NB],
          userLocale: 'de-DE',
        }) as unknown as ChatGraphState
    ) as unknown as NotebookPraezisionDeps['initializeChatState'],
    buildSystemMessage: vi.fn(
      async () => 'BASIS'
    ) as unknown as NotebookPraezisionDeps['buildSystemMessage'],
    streamAgenticResponse: vi.fn(async (p: Record<string, unknown>) => {
      loopCalls.push(p);
      const loopSse = p.sse as SSEWriter;
      loopSse.send('text_delta', { text: 'Im Notebook liegen 3 Quellen [1].' });
      // Die Loop-eigene Completion (Zitat-Klammer) darf nie durchkommen.
      loopSse.send('completion', { text: 'x', citations: [] });
      return opts.outcome ?? outcome();
    }) as unknown as NotebookPraezisionDeps['streamAgenticResponse'],
  };
  const run = () =>
    runNotebookPraezisionTurn(
      {
        req: {} as Request,
        res: fakeRes(opts.resDestroyed ?? false),
        sse,
        messages: (opts.messages ?? [
          { role: 'user', content: 'Frühere Frage' },
          { role: 'assistant', content: 'Frühere Antwort [cite:1]', citations: [{ index: '1' }] },
          { role: 'user', content: 'Wie viele Quellen liegen im Notebook?' },
        ]) as never,
        collectionIds: [NB],
        userId: 'user-1',
        userLocale: 'de-DE',
        threadId: 't1',
        standingInstructions: ['Immer duzen.'],
        answerModeReason: 'explicit',
      },
      deps
    );
  return { run, sent, deps, loopCalls };
}

describe('runNotebookPraezisionTurn', () => {
  it('runs the loop pinned, locked and read-only on the page notebooks', async () => {
    const { run, loopCalls } = setup();
    await run();
    const p = loopCalls[0]!;
    expect(p.disableMcp).toBe(true);
    expect(p.toolAllowlist).toEqual(['notebook_quellen']);
    expect(p).not.toHaveProperty('modelId');
    expect(p.threadId).toBe('t1');
    const state = p.finalState as ChatGraphState;
    expect(state.intent).toBe('agentic');
    expect(state.mentionPinnedTool).toBe('notebook_quellen');
    expect(state.notebookScopeLock).toEqual({ ids: [NB], readOnly: true });
    expect(state.agentConfig.userId).toBe('user-1');
    expect(state.lastUserTextNoMentions).toBe('Wie viele Quellen liegen im Notebook?');
    const system = p.systemMessage as string;
    expect(system.startsWith('BASIS')).toBe(true);
    expect(system).toContain('PRÄZISIONSMODUS');
    expect(system).toContain('Immer duzen.');
  });

  it('hands the loop plain role/content history, no citations', async () => {
    const { run, loopCalls } = setup();
    await run();
    const messages = loopCalls[0]!.messages as Array<Record<string, unknown>>;
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: 'Wie viele Quellen liegen im Notebook?',
    });
    for (const m of messages) expect(Object.keys(m).sort()).toEqual(['content', 'role']);
  });

  it('streams the loop events but sends exactly one notebook-shaped completion', async () => {
    const { run, sent } = setup();
    await run();
    expect(sent.some((e) => e.event === 'text_delta')).toBe(true);
    const completions = sent.filter((e) => e.event === 'completion');
    expect(completions).toHaveLength(1);
    const c = completions[0]!.data;
    expect(c.answer).toBe('Im Notebook liegen 3 Quellen [1].');
    expect(c.text).toBe(c.answer);
    expect((c.citations as Array<Record<string, unknown>>)[0]).toMatchObject({
      index: '1',
      document_title: 'Antrag Radweg',
    });
    expect((c.sources as unknown[]).length).toBe(1);
    expect(c.metadata).toMatchObject({ answerMode: 'praezision', answerModeReason: 'explicit' });
  });

  it('returns persistable steps without textOffset', async () => {
    const { run } = setup();
    const result = await run();
    expect(result!.steps).toEqual([
      {
        toolCallId: 'c1',
        toolName: 'notebook_quellen',
        args: { action: 'list' },
        result: { total: 3 },
      },
    ]);
    expect(result!.citations[0]!.index).toBe('1');
    expect(result!.question).toBe('Wie viele Quellen liegen im Notebook?');
  });

  it('still returns a degraded turn, so its honest text persists', async () => {
    const { run, sent } = setup({
      outcome: outcome({
        fullText: 'Ich konnte dazu leider keine passende Antwort finden.',
        degraded: 'no_answer',
        citations: [],
      }),
    });
    const result = await run();
    expect(result!.answer).toMatch(/keine passende Antwort/);
    expect(result!.degraded).toBe('no_answer');
    const c = sent.find((e) => e.event === 'completion')!.data;
    expect(c.metadata).toMatchObject({ degraded: 'no_answer' });
  });

  it('refuses a request without a user message before building anything', async () => {
    const { run, sent, deps } = setup({ messages: [{ role: 'assistant', content: 'x' }] });
    expect(await run()).toBeNull();
    expect(sent.find((e) => e.event === 'error')!.data.code).toBe('invalid_request');
    expect(deps.initializeChatState).not.toHaveBeenCalled();
  });
});

describe('runNotebookPraezisionTurn — setup failures', () => {
  it('sends an error and returns null when the state cannot be built', async () => {
    const { run, sent, deps } = setup();
    vi.mocked(deps.initializeChatState).mockRejectedValueOnce(new Error('agent not found'));
    expect(await run()).toBeNull();
    const error = sent.find((e) => e.event === 'error')!.data;
    expect(error).toMatchObject({ code: 'internal', retryable: true });
    expect(deps.streamAgenticResponse).not.toHaveBeenCalled();
  });

  it('sends an error and returns null when the system prompt cannot be built', async () => {
    const { run, sent, deps } = setup();
    vi.mocked(deps.buildSystemMessage).mockRejectedValueOnce(new Error('db down'));
    expect(await run()).toBeNull();
    expect(sent.find((e) => e.event === 'error')!.data.code).toBe('internal');
  });

  it('aborts the loop at once when the client is already gone', async () => {
    const { run, loopCalls } = setup({ resDestroyed: true });
    await run();
    expect((loopCalls[0]!.reqSignal as AbortSignal).aborted).toBe(true);
  });
});

describe('NotebookLoopSSE', () => {
  it('swallows completion and forwards everything else to the page writer', () => {
    const { sse, sent } = fakeSse();
    const loop = new NotebookLoopSSE(fakeRes(), sse);
    loop.send('text_delta', { text: 'a' });
    loop.send('completion', { text: 'b', citations: [] });
    loop.sendRaw('completion', {});
    loop.send('warning', { code: 'citation_invalid', message: 'm' });
    expect(sent.map((e) => e.event)).toEqual(['text_delta', 'warning']);
    loop.end();
    expect(sse.end).toHaveBeenCalled();
  });
});
