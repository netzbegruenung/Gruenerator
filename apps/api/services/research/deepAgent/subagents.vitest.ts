/**
 * The `task` tool on its own: what the lead gets back, and what the sidebar
 * shows, when a researcher answers, fails, or runs out of steps.
 */

import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createTaskTool, type TaskToolOptions } from './subagents.js';

import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import type { ResearchStep } from './types.js';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type Content = LanguageModelV4GenerateResult['content'];

function scripted(turns: Content[]) {
  return new MockLanguageModelV4({
    doGenerate: turns.map((content) => ({
      content,
      finishReason: content.some((c) => c.type === 'tool-call')
        ? { unified: 'tool-calls', raw: 'tool_calls' }
        : { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    })) as unknown as LanguageModelV4GenerateResult[],
  });
}

const ANSWER = {
  ergebnis: 'Ergebnis.',
  quellen: [{ titel: 'Quelle', url: 'https://example.org' }],
  luecken: [],
  belastbarkeit: 'hoch',
};

function setup(model: MockLanguageModelV4 | { doGenerate: () => never }, steps = 4) {
  const emitted: ResearchStep[] = [];
  const options: TaskToolOptions = {
    subagents: [{ name: 'web-recherche', description: 'Web', prompt: 'Recherchiere.' }],
    tools: {},
    worker: { model: model as never, providerOptions: {}, temperature: 0 },
    steps,
    onStep: (s) => emitted.push(s),
  };
  const task = createTaskTool(options);
  const execute = task.execute!;
  const invoke = (abortSignal?: AbortSignal) =>
    execute({ subagent_type: 'web-recherche', description: 'Wie teuer ist das Ticket?' }, {
      toolCallId: 'c1',
      messages: [],
      ...(abortSignal ? { abortSignal } : {}),
    } as never) as Promise<string>;
  return { emitted, invoke };
}

describe('task', () => {
  it('hands the researcher answer back to the lead as JSON', async () => {
    const worker = scripted([
      [
        {
          type: 'tool-call',
          toolCallId: 'a',
          toolName: 'antwort_geben',
          input: JSON.stringify(ANSWER),
        },
      ],
    ]);
    const { emitted, invoke } = setup(worker);

    expect(JSON.parse(await invoke())).toEqual(ANSWER);
    expect(emitted.map((s) => s.status)).toEqual(['running', 'done']);
    expect(emitted[0]?.label).toBe('Web-Recherche: Wie teuer ist das Ticket?');
  });

  it('leaves only the answer tool on the last allowed step', async () => {
    const worker = scripted([
      [{ type: 'tool-call', toolCallId: 's', toolName: 'unbekannt', input: '{}' }],
      [
        {
          type: 'tool-call',
          toolCallId: 'a',
          toolName: 'antwort_geben',
          input: JSON.stringify(ANSWER),
        },
      ],
    ]);
    const { invoke } = setup(worker, 2);

    await invoke();

    expect(worker.doGenerateCalls[1]?.tools?.map((t) => t.name)).toEqual(['antwort_geben']);
    // Not forced — the Gemma lane answers a forced choice with text, and the
    // SDK throws on it.
    expect(worker.doGenerateCalls[1]?.toolChoice).not.toEqual({
      type: 'tool',
      toolName: 'antwort_geben',
    });
  });

  it('passes a plain-text ending through rather than dropping a finished answer', async () => {
    const { invoke } = setup(scripted([[{ type: 'text', text: 'Das Ticket kostet 63 Euro.' }]]));

    expect(await invoke()).toBe('Das Ticket kostet 63 Euro.');
  });

  it('turns a failed researcher into a sentence the lead can act on', async () => {
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('503');
      },
    });
    const { emitted, invoke } = setup(broken);

    expect(await invoke()).toMatch(/fehlgeschlagen/);
    expect(emitted.at(-1)).toMatchObject({
      status: 'failed',
      label: expect.not.stringMatching(/Zeit/),
    });
  });

  it('says so when the clock, not the work, ended a delegation', async () => {
    const controller = new AbortController();
    controller.abort();
    // Like a real provider, the model call honours the signal.
    const respectsSignal = new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        abortSignal?.throwIfAborted();
        throw new Error('unreachable');
      },
    });
    const { emitted, invoke } = setup(respectsSignal);

    await expect(invoke(controller.signal)).rejects.toThrow();
    expect(emitted.at(-1)).toMatchObject({
      status: 'failed',
      label: expect.stringMatching(/Zeit abgelaufen$/),
    });
  });
});
