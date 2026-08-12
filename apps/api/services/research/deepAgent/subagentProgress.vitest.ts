import { describe, expect, it } from 'vitest';

import {
  subagentLabel,
  trackSubagents,
  type SubagentLike,
  type TaskCallLike,
} from './subagentProgress.js';

import type { ResearchStep } from './types.js';

/**
 * Fed by hand-built async iterables rather than a real run: what is under test
 * is the JOIN between two projections that arrive in an order nobody controls,
 * and a live agent would only ever show one of those orders.
 */
async function* iterate<T>(items: T[], gate?: Promise<unknown>): AsyncIterable<T> {
  for (const item of items) {
    yield item;
    if (gate) await gate;
  }
}

function taskCall(callId: string, description: string): TaskCallLike {
  return { name: 'task', callId, input: { description, subagent_type: 'web-recherche' } };
}

function subagent(
  name: string,
  callId: string | null,
  output: Promise<unknown> = Promise.resolve({})
): SubagentLike {
  return { name, output, ...(callId ? { cause: { tool_call_id: callId } } : {}) };
}

/** Last step per id — what the panel ends up showing after merging. */
function finalSteps(steps: ResearchStep[]): Map<string, ResearchStep> {
  const byId = new Map<string, ResearchStep>();
  for (const step of steps) byId.set(step.id, step);
  return byId;
}

describe('subagentLabel', () => {
  it('names the kind of researcher, not the registry id', () => {
    expect(subagentLabel('web-recherche', 'Wehrpflicht seit 2024')).toBe(
      'Web-Recherche: Wehrpflicht seit 2024'
    );
    expect(subagentLabel('programm-recherche')).toBe('Programm-Recherche');
  });

  it('falls back to the raw name instead of dropping the step', () => {
    expect(subagentLabel('etwas-neues', 'Frage')).toBe('etwas-neues: Frage');
  });

  it('fits a sub-question into a sidebar row', () => {
    const label = subagentLabel('web-recherche', 'W'.repeat(300));

    expect(label.length).toBeLessThanOrEqual('Web-Recherche: '.length + 90);
    expect(label.endsWith('…')).toBe(true);
  });

  it('flattens the newlines a lead writes into its task description', () => {
    expect(subagentLabel('web-recherche', 'Erste Zeile\n  zweite  Zeile')).toBe(
      'Web-Recherche: Erste Zeile zweite Zeile'
    );
  });
});

describe('trackSubagents', () => {
  it('reports one step per delegation, from start to finish', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      {
        toolCalls: iterate([taskCall('call-1', 'Wehrpflicht: Debatte seit 2024')]),
        subagents: iterate([subagent('web-recherche', 'call-1')]),
      },
      (step) => steps.push(step)
    );
    await Promise.resolve();

    const final = finalSteps(steps);
    expect(final.size).toBe(1);
    expect(final.get('sub-call-1')).toEqual({
      id: 'sub-call-1',
      label: 'Web-Recherche: Wehrpflicht: Debatte seit 2024',
      status: 'done',
    });
  });

  /**
   * The reason the join exists at all. `run.subagents` and `run.toolCalls` are
   * independent projections — the handle regularly arrives before the call's
   * arguments are observable, and the step must not wait for the label.
   */
  it('shows the subagent before its sub-question is known, then sharpens', async () => {
    const steps: ResearchStep[] = [];
    let releaseCalls = (): void => {};
    const calls = new Promise<void>((resolve) => {
      releaseCalls = resolve;
    });

    const tracking = trackSubagents(
      {
        toolCalls: (async function* () {
          await calls;
          yield taskCall('call-1', 'Wehrpflicht');
        })(),
        // Still running, so the only thing that changes between the two
        // emissions is the label — which is what this test is about.
        subagents: iterate([subagent('programm-recherche', 'call-1', new Promise(() => {}))]),
      },
      (step) => steps.push(step)
    );
    await Promise.resolve();
    releaseCalls();
    await tracking;

    // Same id throughout — the panel merges by id, so this sharpens one row
    // instead of adding a second.
    expect(steps.map((s) => s.label)).toEqual([
      'Programm-Recherche',
      'Programm-Recherche: Wehrpflicht',
    ]);
    expect(new Set(steps.map((s) => s.id))).toEqual(new Set(['sub-call-1']));
  });

  it('keeps concurrent delegations apart', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      {
        toolCalls: iterate([taskCall('a', 'Zahlen'), taskCall('b', 'Beschlusslage')]),
        subagents: iterate([subagent('web-recherche', 'a'), subagent('programm-recherche', 'b')]),
      },
      (step) => steps.push(step)
    );
    await Promise.resolve();

    const final = finalSteps(steps);
    expect([...final.values()].map((s) => s.label).sort()).toEqual([
      'Programm-Recherche: Beschlusslage',
      'Web-Recherche: Zahlen',
    ]);
  });

  it('marks a failed delegation instead of leaving it spinning', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      {
        toolCalls: iterate([taskCall('call-1', 'Wehrpflicht')]),
        subagents: iterate([subagent('web-recherche', 'call-1', Promise.reject(new Error('weg')))]),
      },
      (step) => steps.push(step)
    );
    await Promise.resolve();

    expect(finalSteps(steps).get('sub-call-1')?.status).toBe('failed');
  });

  it('ignores every tool call that is not a delegation', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      {
        toolCalls: iterate([
          { name: 'web_suche', callId: 'x', input: { query: 'Wien' } },
          { name: 'task', callId: 'call-1', input: { description: 'Wehrpflicht' } },
        ]),
        subagents: iterate([subagent('web-recherche', 'call-1')]),
      },
      (step) => steps.push(step)
    );

    // The researchers' own searches keep their own step wording via ctx.onStep;
    // duplicating them here would double every row in the panel.
    expect(steps.every((s) => s.id === 'sub-call-1')).toBe(true);
  });

  /**
   * `cause` is documented as possibly missing. Dropping the step would make a
   * running sub-question invisible — worse than a row without its question.
   */
  it('still shows a delegation whose cause could not be recovered', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      { toolCalls: iterate([]), subagents: iterate([subagent('web-recherche', null)]) },
      (step) => steps.push(step)
    );
    await Promise.resolve();

    expect(steps[0]?.label).toBe('Web-Recherche');
    expect(steps[0]?.id).toContain('ohne-aufruf-');
  });

  /**
   * The reason `output` is not awaited inside the tracker: a delegation that
   * never settles would otherwise hold the run open forever. Resolving on the
   * iterables alone is what bounds it.
   */
  it('finishes even while a delegation is still running', async () => {
    const steps: ResearchStep[] = [];

    await trackSubagents(
      {
        toolCalls: iterate([taskCall('call-1', 'Wehrpflicht')]),
        subagents: iterate([subagent('web-recherche', 'call-1', new Promise(() => {}))]),
      },
      (step) => steps.push(step)
    );

    expect(finalSteps(steps).get('sub-call-1')?.status).toBe('running');
  });
});

/**
 * `index.ts` reaches the run through a hand-written surface (`as unknown as`),
 * because the `as never` on tools and middleware collapses the agent's inferred
 * generics. A cast cannot fail — this is what checks the shape it claims.
 */
describe('the run surface index.ts asserts', () => {
  it('exists on a real deep agent', async () => {
    const { createDeepAgent } = await import('deepagents');
    const { ChatOpenAI } = await import('@langchain/openai');

    const agent = createDeepAgent({
      model: new ChatOpenAI({
        apiKey: 'test',
        model: 'test-model',
        configuration: { baseURL: 'http://localhost' },
      }),
      tools: [],
      subagents: [{ name: 'web-recherche', description: 'd', systemPrompt: 'p' }],
    });

    expect(typeof (agent as unknown as { streamEvents?: unknown }).streamEvents).toBe('function');
  });
});
