/**
 * The lead loop end to end, on scripted models.
 *
 * Every repair the LangGraph version did as middleware is now a branch of this
 * loop, so this is where they are pinned: the report path, the nudge, the
 * poisoned tool name, the wrap-up leg and the restart resume. The models are
 * `MockLanguageModelV4` scripts; the search services and the registry are
 * stubbed, so nothing here leaves the process.
 */

import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from '@ai-sdk/provider';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type Content = LanguageModelV4GenerateResult['content'];

function call(
  toolName: string,
  input: unknown,
  id = `${toolName}-${Math.random()}`
): Content[number] {
  return { type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input) };
}

function text(value: string): Content[number] {
  return { type: 'text', text: value };
}

/** A model that answers each call with the next scripted turn. */
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

let lead = scripted([]);
let worker = scripted([]);

vi.mock('./models.js', () => ({
  leadModel: () => ({ model: lead, providerOptions: {}, temperature: 0 }),
  workerModel: () => ({ model: worker, providerOptions: {}, temperature: 0 }),
}));

const recordRunState = vi.fn();
const getRun = vi.fn();
vi.mock('./runRegistry.js', () => ({
  recordRunStarted: vi.fn(),
  recordRunFinished: vi.fn(),
  recordRunState: (...args: unknown[]) => recordRunState(...args),
  getRun: (...args: unknown[]) => getRun(...args),
}));

const webSearch = vi.fn();
vi.mock('../../search/webSearch.js', () => ({
  canWebSearch: () => true,
  webSearch: (...args: unknown[]) => webSearch(...args),
}));
vi.mock('../../search/CrawlingService.js', () => ({ crawlAndDistill: vi.fn() }));

const { runDeepAgentResearch } = await import('./index.js');
const { NUDGE_TEXT } = await import('./nudgeMissingReport.js');
const { RETRY_TEXT } = await import('./sanitizeToolCalls.js');
const { RESUMED_RUN_TEXT, WRAP_UP_TEXT } = await import('./resume.js');
const { PROBE_BUDGET } = await import('./types.js');

const REPORT = `# Wiens Klimaziel 2040\n\n## Zusammenfassung\n\n${'Wien will bis 2040 klimaneutral sein. '.repeat(20)}\n\n## Quellen\n\n1. Stadt Wien — https://wien.gv.at`;

const ANSWER = {
  ergebnis: 'Wien strebt Klimaneutralität bis 2040 an.',
  quellen: [{ titel: 'Stadt Wien', url: 'https://wien.gv.at' }],
  luecken: [],
  belastbarkeit: 'hoch',
};

function run(overrides: { threadId?: string } = {}) {
  const plans: unknown[] = [];
  const steps: { id: string; label: string; status: string }[] = [];
  const result = runDeepAgentResearch({
    question: 'Wie ambitioniert ist Wiens Klimaziel 2040?',
    locale: 'de-AT',
    budget: PROBE_BUDGET,
    progress: { onPlan: (p) => plans.push(p), onStep: (s) => steps.push(s) },
    ...overrides,
  });
  return { result, plans, steps };
}

/** The prompt messages the lead received on its n-th call. */
function leadPrompt(n: number): LanguageModelV4CallOptions['prompt'] {
  const options = lead.doGenerateCalls[n];
  if (!options)
    throw new Error(`lead was called ${lead.doGenerateCalls.length} times, not ${n + 1}`);
  return options.prompt;
}

function promptText(prompt: LanguageModelV4CallOptions['prompt']): string {
  return JSON.stringify(prompt);
}

beforeEach(() => {
  vi.clearAllMocks();
  getRun.mockResolvedValue(null);
});

describe('runDeepAgentResearch', () => {
  it('plans, delegates and files the report the lead wrote', async () => {
    lead = scripted([
      [call('write_todos', { todos: [{ content: 'Klimaziel Wien', status: 'in_progress' }] })],
      [call('task', { subagent_type: 'web-recherche', description: 'Klimaziel Wien 2040' }, 't1')],
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Wien will bis 2040 klimaneutral werden; der Bericht liegt als Dokument vor.')],
    ]);
    worker = scripted([[call('antwort_geben', ANSWER)]]);

    const { result, plans, steps } = run();
    const out = await result;

    expect(out?.markdown).toContain('# Wiens Klimaziel 2040');
    expect(out?.partial).toBe(false);
    expect(out?.summary).toContain('klimaneutral');
    expect(plans).toEqual([[{ id: 'plan-0', label: 'Klimaziel Wien', status: 'running' }]]);
    expect(steps).toContainEqual(
      expect.objectContaining({
        id: 'sub-t1',
        status: 'done',
        label: expect.stringContaining('Web-Recherche'),
      })
    );
    // The researcher got the sub-question and nothing else …
    expect(promptText(worker.doGenerateCalls[0]!.prompt)).toContain('Klimaziel Wien 2040');
    // … and the lead got its structured answer back as the tool result.
    expect(promptText(leadPrompt(2))).toContain('Wien strebt Klimaneutralität bis 2040 an.');
  });

  it('saves the state after every lead step', async () => {
    lead = scripted([
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Fertig, der Bericht liegt vor und fasst die Lage in Wien zusammen.')],
    ]);

    await run().result;

    expect(recordRunState).toHaveBeenCalledTimes(2);
    const [, last] = recordRunState.mock.calls.at(-1) as [string, { workspace: { files: object } }];
    expect(last.workspace.files).toHaveProperty('/bericht.md');
  });

  it('pushes a lead back to work when it answers without a report', async () => {
    lead = scripted([
      [text('Wien will bis 2040 klimaneutral sein.')],
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Der Bericht liegt jetzt als Dokument vor, mit allen Quellen.')],
    ]);

    const out = await run().result;

    expect(out?.markdown).toContain('# Wiens Klimaziel 2040');
    expect(promptText(leadPrompt(1))).toContain(NUDGE_TEXT);
  });

  it('gives up after the nudge limit instead of looping', async () => {
    lead = scripted([[text('Nein.')], [text('Nein.')], [text('Nein.')]]);

    const out = await run().result;

    expect(out).toBeNull();
    expect(lead.doGenerateCalls).toHaveLength(3);
  });

  it('keeps a poisoned tool name off the wire and asks for the call again', async () => {
    lead = scripted([
      [call('1,2,5', {})],
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Der Bericht liegt jetzt als Dokument vor, mit allen Quellen.')],
    ]);

    const out = await run().result;

    expect(out).not.toBeNull();
    const second = promptText(leadPrompt(1));
    expect(second).not.toContain('1,2,5');
    expect(second).toContain(RETRY_TEXT);
  });

  it('turns a spent step budget into a wrap-up leg that can only write', async () => {
    const searching = Array.from({ length: PROBE_BUDGET.leadSteps }, () => [
      call('web_suche', { query: 'Wien' }),
    ]);
    webSearch.mockResolvedValue({ hits: [] });
    lead = scripted([
      ...searching,
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Der Bericht liegt jetzt als Dokument vor, mit allen Quellen.')],
    ]);

    const out = await run().result;

    expect(out?.markdown).toContain('# Wiens Klimaziel 2040');
    const wrapUp = lead.doGenerateCalls[PROBE_BUDGET.leadSteps]!;
    expect(promptText(wrapUp.prompt)).toContain(WRAP_UP_TEXT);
    expect(wrapUp.tools?.map((t) => t.name).sort()).toEqual(['read_file', 'write_file']);
  });

  it('continues a saved run from its history instead of the question', async () => {
    getRun.mockResolvedValue({
      state: {
        messages: [{ role: 'user', content: 'Wie ambitioniert ist Wiens Klimaziel 2040?' }],
        workspace: { todos: [], files: {} },
      },
    });
    lead = scripted([
      [call('write_file', { file_path: '/bericht.md', content: REPORT })],
      [text('Der Bericht liegt jetzt als Dokument vor, mit allen Quellen.')],
    ]);

    const out = await run({ threadId: 'research-alt' }).result;

    expect(out?.threadId).toBe('research-alt');
    expect(promptText(leadPrompt(0))).toContain(RESUMED_RUN_TEXT);
  });
});
