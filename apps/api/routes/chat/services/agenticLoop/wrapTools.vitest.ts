import { describe, it, expect, vi } from 'vitest';

import { createToolLoopGuards } from './loopGuards.js';
import { createToolActivity } from './toolActivity.js';
import { type PersistedStep } from './types.js';
import { wrapToolsForLoop, type WrapToolsContext } from './wrapTools.js';

import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

interface RecordedEvent {
  event: string;
  data: Record<string, unknown>;
}

function makeCtx(overrides: Partial<WrapToolsContext> = {}): {
  ctx: WrapToolsContext;
  events: RecordedEvent[];
  steps: PersistedStep[];
} {
  const events: RecordedEvent[] = [];
  const steps: PersistedStep[] = [];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => events.push({ event, data }),
  } as unknown as SSEWriter;
  const ctx: WrapToolsContext = {
    sse,
    guards: createToolLoopGuards(),
    recordStep: (s) => steps.push(s),
    perCallTimeoutMs: 1000,
    ...overrides,
  };
  return { ctx, events, steps };
}

function run(tools: ToolSet, name: string, input: unknown, callId = 'call_1'): Promise<unknown> {
  const exec = (
    tools[name] as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }
  ).execute;
  return exec(input, { toolCallId: callId });
}

describe('wrapToolsForLoop', () => {
  it('emits start+result, records the full step, and returns the result on success', async () => {
    const { ctx, events, steps } = makeCtx();
    const tools = wrapToolsForLoop(
      {
        search: {
          execute: async () => ({ results: [{ title: 'a' }, { title: 'b' }] }),
        },
      } as unknown as ToolSet,
      ctx
    );

    const out = (await run(tools, 'search', { query: 'x' })) as { results: unknown[] };
    expect(out.results).toHaveLength(2);
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
    expect(events[1].data).toMatchObject({ ok: true, summary: '2 Ergebnisse' });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ toolName: 'search', toolCallId: 'call_1' });
  });

  it('contains a thrown tool as an { error } result and notes the failure', async () => {
    const { ctx, events } = makeCtx();
    const tools = wrapToolsForLoop(
      {
        boom: {
          execute: async () => {
            throw new Error('kaputt');
          },
        },
      } as unknown as ToolSet,
      ctx
    );

    const out = (await run(tools, 'boom', {})) as { error: string };
    expect(out.error).toBe('kaputt');
    expect(events[1].data).toMatchObject({ ok: false });
    expect(ctx.guards.checkFailureCap('boom')).toBeNull(); // 1 failure, cap is 2
  });

  it('times out a hanging tool', async () => {
    const { ctx } = makeCtx({ perCallTimeoutMs: 20 });
    const tools = wrapToolsForLoop(
      {
        hang: { execute: () => new Promise(() => {}) },
      } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'hang', {})) as { error: string };
    expect(out.error).toMatch(/Zeitüberschreitung/);
  });

  it('tells the abandoned tool that it was written off', async () => {
    // A timeout stops the WAIT, not the tool. For a generation tool that meant a
    // document still got written and a card still got pushed, into a turn whose
    // model had already been told the call failed (live, 02.08.2026). The signal
    // is how a tool can tell; the generation tools check it before committing.
    const { ctx } = makeCtx({ perCallTimeoutMs: 20 });
    let seen: AbortSignal | undefined;
    const tools = wrapToolsForLoop(
      {
        hang: {
          execute: (_i: unknown, o: { abortSignal?: AbortSignal }) => {
            seen = o.abortSignal;
            return new Promise(() => {});
          },
        },
      } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'hang', {});
    expect(seen?.aborted).toBe(true);
  });

  it('leaves the signal untouched when the tool returns in time', async () => {
    const { ctx } = makeCtx({ perCallTimeoutMs: 200 });
    let seen: AbortSignal | undefined;
    const tools = wrapToolsForLoop(
      {
        quick: {
          execute: async (_i: unknown, o: { abortSignal?: AbortSignal }) => {
            seen = o.abortSignal;
            return { ok: true };
          },
        },
      } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'quick', {});
    expect(seen?.aborted).toBe(false);
  });

  it('a timeout counts as a tool failure, closes the card and persists the step', async () => {
    // This is what keeps the hand-rolled `withTimeout` in place. The AI SDK's
    // `timeout.toolMs` aborts from OUTSIDE the wrapper — it merely merges an
    // AbortSignal into the tool's options and then awaits — so swapping to it
    // would skip all three effects below: the failure would never be counted,
    // the step never recorded, and the tool card would spin forever. Whoever
    // attempts that swap should see this go red.
    const { ctx, events, steps } = makeCtx({ perCallTimeoutMs: 20 });
    const tools = wrapToolsForLoop(
      { hang: { execute: () => new Promise(() => {}) } } as unknown as ToolSet,
      ctx
    );

    // Distinct args on purpose: identical ones would be stopped by the
    // duplicate guard, which never reaches the timeout at all.
    await run(tools, 'hang', { q: 'a' });
    await run(tools, 'hang', { q: 'b' }, 'call_2');

    // Two failures = the per-tool cap, so a third call would be short-circuited.
    expect(ctx.guards.checkFailureCap('hang')).not.toBeNull();
    expect(steps).toHaveLength(2);
    const results = events.filter((e) => e.event === 'tool_step_result');
    expect(results).toHaveLength(2);
    expect(results[0].data).toMatchObject({ ok: false });
  });

  it('gives a named tool its own, longer budget', async () => {
    // Deep research measured 16.5s live against the generic 20s cap — 3.5s of
    // headroom, so under load the cap killed a legitimate call and the turn
    // saw only "tool failed". The override buys that call its honest runtime
    // without loosening the cap that protects every other tool.
    const { ctx } = makeCtx({
      perCallTimeoutMs: 20,
      perCallTimeoutOverridesMs: { research: 400 },
    });
    const tools = wrapToolsForLoop(
      {
        research: { execute: () => new Promise((r) => setTimeout(() => r('tief'), 60)) },
        web_search: { execute: () => new Promise((r) => setTimeout(() => r('flach'), 60)) },
      } as unknown as ToolSet,
      ctx
    );

    // Same 60ms of work: the override survives it, the generic budget does not.
    expect(await run(tools, 'research', {})).toBe('tief');
    expect((await run(tools, 'web_search', {})) as { error: string }).toMatchObject({
      error: expect.stringMatching(/Zeitüberschreitung/) as unknown as string,
    });
  });

  it('zählt laufende Aufrufe — auch wenn der Aufruf in die Zeitüberschreitung läuft', async () => {
    // Die Stillstands-Uhr der Werkzeugphase (loopEngine) liest diesen Zähler:
    // ein laufender Aufruf blockiert den Stream legitim. Bliebe er nach einer
    // Zeitüberschreitung stehen, wäre die Uhr für den Rest des Zuges taub.
    const activity = createToolActivity();
    const seen: number[] = [];
    const { ctx } = makeCtx({ perCallTimeoutMs: 20, toolActivity: activity });
    const tools = wrapToolsForLoop(
      {
        schnell: {
          execute: async () => {
            seen.push(activity.inFlight());
            return 'ok';
          },
        },
        haengt: { execute: () => new Promise(() => {}) },
      } as unknown as ToolSet,
      ctx
    );

    await run(tools, 'schnell', {});
    expect(seen).toEqual([1]);
    expect(activity.inFlight()).toBe(0);

    await run(tools, 'haengt', {}, 'call_2');
    expect(activity.inFlight()).toBe(0);
  });

  it('short-circuits when the per-tool failure cap is already reached', async () => {
    const { ctx, steps } = makeCtx();
    ctx.guards.noteFailure('search');
    ctx.guards.noteFailure('search'); // now at cap (2)
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { error: string };
    expect(out.error).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    // The tool never ran, so there is nothing to show or persist.
    expect(steps).toHaveLength(0);
  });

  /**
   * The guard messages are STEERING TEXT for the planner, not status reports. A
   * card would tell the user the assistant searched and failed, about a call
   * that never left the wrapper — live: a "Websuche" card captioned "Nutze
   * zuerst gruenerator_search (interne Dokumente)".
   */
  it('search-budget-blocked call is silent: no card, no step, no counter change', async () => {
    const { ctx, events, steps } = makeCtx({
      guards: createToolLoopGuards({
        searchToolNames: new Set(['web_search']),
        maxSearchCalls: 1,
      }),
    });
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ web_search: { execute } } as unknown as ToolSet, ctx);

    await run(tools, 'web_search', { query: 'a' });
    expect(execute).toHaveBeenCalledTimes(1);

    const out = (await run(tools, 'web_search', { query: 'b' }, 'call_2')) as { error: string };
    expect(out.error).toMatch(/bereits ausführlich gesucht/);
    expect(execute).toHaveBeenCalledTimes(1); // second call never executed
    expect(events.filter((e) => e.event === 'tool_step_start')).toHaveLength(1);
    expect(steps).toHaveLength(1);
    // The blocked call didn't advance the budget counter further (still capped, not negative).
    expect(ctx.guards.checkSearchBudget('web_search')).not.toBeNull();
  });

  /**
   * The regression the internal-first gate caused: "wer war marilyn monroe?"
   * has no party documents behind it, the gate refused the web anyway, and the
   * turn was answered from model memory — wrong film title, zero sources.
   */
  it('runs web_search straight away — no internal search required first', async () => {
    const { ctx, events, steps } = makeCtx({
      guards: createToolLoopGuards({
        internalFallback: { requiredTool: 'gruenerator_search', fallbackTool: 'web_search' },
        searchToolNames: new Set(['web_search', 'gruenerator_search']),
      }),
    });
    const execute = vi.fn(async () => ({ results: [{ title: 'Marilyn Monroe' }] }));
    const tools = wrapToolsForLoop({ web_search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'web_search', { query: 'wer war marilyn monroe' })) as {
      results: unknown[];
    };
    expect(execute).toHaveBeenCalledTimes(1);
    expect(out.results).toHaveLength(1);
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
    expect(steps).toHaveLength(1);
  });

  it('forces the web after an internal search that found nothing', async () => {
    const { ctx } = makeCtx({
      guards: createToolLoopGuards({
        internalFallback: { requiredTool: 'gruenerator_search', fallbackTool: 'web_search' },
        getSourceCount: () => 0,
      }),
    });
    const tools = wrapToolsForLoop(
      {
        gruenerator_search: { execute: async () => ({ results: [] }) },
      } as unknown as ToolSet,
      ctx
    );

    expect(ctx.guards.emptyResultFallback()).toBeNull();
    await run(tools, 'gruenerator_search', { query: 'x' });
    expect(ctx.guards.emptyResultFallback()).toBe('web_search');
  });

  it('truncates the model-facing payload but records the full result', async () => {
    const { ctx, steps } = makeCtx({ maxResultChars: 1000 });
    const big = { content: 'y'.repeat(50_000) };
    const tools = wrapToolsForLoop(
      { fetch: { execute: async () => big } } as unknown as ToolSet,
      ctx
    );

    const out = (await run(tools, 'fetch', {})) as { _truncated?: boolean };
    expect(out._truncated).toBe(true);
    // The persisted/recorded step keeps the full untruncated content.
    expect((steps[0].result as { content: string }).content.length).toBe(50_000);
  });

  it('parallel identical calls: the guard races synchronously, only one executes', async () => {
    const { ctx } = makeCtx();
    const execute = vi.fn(async () => ({ results: [1] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    // AI SDK executes parallel tool calls concurrently; the dedup check runs in
    // the synchronous prefix of execute, so the second identical call must be
    // blocked even though the first hasn't resolved yet.
    const [a, b] = await Promise.all([
      run(tools, 'search', { query: 'x' }, 'call_1'),
      run(tools, 'search', { query: 'x' }, 'call_2'),
    ]);
    const outs = [a, b] as { error?: string }[];
    expect(outs.filter((o) => o.error).length).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('contains a non-Error throw (string) as an { error } result', async () => {
    const { ctx } = makeCtx();
    const tools = wrapToolsForLoop(
      {
        weird: {
          execute: async () => {
            throw 'kaboom-string';
          },
        },
      } as unknown as ToolSet,
      ctx
    );
    const out = (await run(tools, 'weird', {})) as { error: string };
    expect(out.error).toContain('kaboom-string');
  });

  it('failure cascade: two error-results trip the cap, third call short-circuits', async () => {
    const { ctx } = makeCtx();
    const execute = vi.fn(async () => ({ error: 'API down' }));
    const tools = wrapToolsForLoop({ flaky: { execute } } as unknown as ToolSet, ctx);

    await run(tools, 'flaky', { q: 1 }, 'c1');
    await run(tools, 'flaky', { q: 2 }, 'c2');
    const third = (await run(tools, 'flaky', { q: 3 }, 'c3')) as { error: string };
    expect(third.error).toMatch(/Fehlversuche/);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('a primitive (non-object) result is recorded as { value } and returned', async () => {
    const { ctx, steps } = makeCtx();
    const tools = wrapToolsForLoop(
      { prim: { execute: async () => 'nur text' } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'prim', {});
    expect(steps[0].result).toEqual({ value: 'nur text' });
  });

  it('guard order: failure cap wins over search budget wins over duplicate', async () => {
    const guards = createToolLoopGuards({
      searchToolNames: new Set(['web_search']),
      maxSearchCalls: 0,
    });
    guards.noteFailure('web_search');
    guards.noteFailure('web_search');
    const { ctx } = makeCtx({ guards });
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ web_search: { execute } } as unknown as ToolSet, ctx);

    // Failure cap (2) AND budget (0) both trip — the failure-cap message must win.
    const out = (await run(tools, 'web_search', { query: 'x' })) as { error: string };
    expect(out.error).toMatch(/Fehlversuche/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('stamps textOffset on the recorded step when getTextOffset is set', async () => {
    const { ctx, steps } = makeCtx({ getTextOffset: () => 42 });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(steps[0].textOffset).toBe(42);
  });

  it('omits textOffset when getTextOffset is absent', async () => {
    const { ctx, steps } = makeCtx();
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect('textOffset' in steps[0]).toBe(false);
  });

  it('omits textOffset when getTextOffset returns null (split mode)', async () => {
    const { ctx, steps } = makeCtx({ getTextOffset: () => null });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect('textOffset' in steps[0]).toBe(false);
  });

  it('stamps textOffset=0 (falsy but valid) on the recorded step', async () => {
    const { ctx, steps } = makeCtx({ getTextOffset: () => 0 });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(steps[0].textOffset).toBe(0);
  });

  it('drains takeNarration at start and stamps it on the card + recorded step', async () => {
    const { ctx, events, steps } = makeCtx({ takeNarration: () => 'Ich suche jetzt danach.' });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    const start = events.find((e) => e.event === 'tool_step_start');
    expect(start?.data).toMatchObject({ narration: 'Ich suche jetzt danach.' });
    expect(steps[0].narration).toBe('Ich suche jetzt danach.');
  });

  it('omits narration when takeNarration returns null (no announcement buffered)', async () => {
    const { ctx, events, steps } = makeCtx({ takeNarration: () => null });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    const start = events.find((e) => e.event === 'tool_step_start');
    expect('narration' in (start?.data ?? {})).toBe(false);
    expect('narration' in steps[0]).toBe(false);
  });

  it('drains the narration buffer once — parallel siblings after it get none', async () => {
    let drained = false;
    const takeNarration = () => {
      if (drained) return null;
      drained = true;
      return 'Ankündigung für beide Aufrufe.';
    };
    const { ctx, steps } = makeCtx({ takeNarration });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'a' }, 'call_a');
    await run(tools, 'search', { query: 'b' }, 'call_b');
    expect(steps[0].narration).toBe('Ankündigung für beide Aufrufe.');
    expect('narration' in steps[1]).toBe(false);
  });

  /**
   * A blocked call must not consume the announcement: the planner said "Ich
   * schaue kurz nach" once, and the call that actually runs is the one it
   * announced. Draining it into a step nobody ever sees loses the sentence.
   */
  it('leaves the narration buffer undrained on a guard-blocked call', async () => {
    let drains = 0;
    const { ctx, steps } = makeCtx({
      takeNarration: () => {
        drains += 1;
        return 'Kurz geprüft.';
      },
    });
    ctx.guards.noteFailure('search');
    ctx.guards.noteFailure('search'); // at cap
    const tools = wrapToolsForLoop(
      {
        search: { execute: async () => ({ results: [] }) },
        other: { execute: async () => ({ results: [] }) },
      } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(drains).toBe(0);
    expect(steps).toHaveLength(0);

    // The next call that really runs gets the announcement.
    await run(tools, 'other', { query: 'x' }, 'call_2');
    expect(steps[0].narration).toBe('Kurz geprüft.');
  });

  it('passes title/serverName onto the start card', async () => {
    const { ctx, events } = makeCtx({
      titleFor: () => 'Suche Notion…',
      serverNameFor: () => 'Notion',
    });
    const tools = wrapToolsForLoop(
      { s0__search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 's0__search', {});
    expect(events[0].data).toMatchObject({ title: 'Suche Notion…', serverName: 'Notion' });
  });

  /**
   * boards_tasks/create_board take structured args (boardId, status, dueDate)
   * that legitimately share most tokens across calls — without the exemption
   * this reads as a near-duplicate search re-phrasing and blocks a valid
   * follow-up call in the same turn (see CHAT-AGENTIC-BUGS.md #1).
   */
  it('nearDuplicateExemptTools skips the near-dup heuristic for structured internal tools', async () => {
    const { ctx } = makeCtx({ nearDuplicateExemptTools: new Set(['boards_tasks']) });
    const tools = wrapToolsForLoop(
      { boards_tasks: { execute: async () => ({ ok: true }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'boards_tasks', { action: 'add_card', boardId: 'b1', title: 'Karte A' });
    // Shares boardId + action tokens with the prior call — would be blocked
    // as near-duplicate for a search-like tool, but boards_tasks is exempt.
    const out = (await run(
      tools,
      'boards_tasks',
      { action: 'add_card', boardId: 'b1', title: 'Karte B' },
      'call_2'
    )) as { error?: string };
    expect(out.error).toBeUndefined();
  });

  it('a tool NOT in nearDuplicateExemptTools still gets blocked as near-duplicate', async () => {
    const { ctx } = makeCtx({ nearDuplicateExemptTools: new Set(['boards_tasks']) });
    const tools = wrapToolsForLoop(
      { gruenerator_search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'gruenerator_search', { query: 'Atomkraft Position Grüne' });
    const out = (await run(
      tools,
      'gruenerator_search',
      { query: 'Position Atomkraft' },
      'call_2'
    )) as { error?: string };
    expect(out.error).toMatch(/Wechsle das THEMA/);
  });
  /**
   * A deferred search is postponed, not failed: no tool card, no persisted step,
   * no failure counted. A red "Fehler" card for a search that will run in the next
   * step is a false statement about the turn, and the model is expected to repeat
   * the identical call — which the duplicate guard would block if the deferral had
   * registered anything.
   */
  it('defers a third concurrent search silently — no card, no step, no failure', async () => {
    const { ctx, events, steps } = makeCtx({
      guards: createToolLoopGuards({ searchToolNames: new Set(['web_search']) }),
    });
    const tools = wrapToolsForLoop(
      { web_search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    // Two in flight, neither completed.
    ctx.guards.noteCall('web_search');
    ctx.guards.noteCall('web_search');

    const out = (await run(tools, 'web_search', { query: 'x' })) as { error?: string };
    expect(out.error).toMatch(/Warte auf das Ergebnis/);
    expect(events).toHaveLength(0);
    expect(steps).toHaveLength(0);
    // Not a failure: the per-tool cap must stay untouched.
    expect(ctx.guards.checkFailureCap('web_search')).toBeNull();
  });

  it('still runs a search when a slot is free', async () => {
    const { ctx, events } = makeCtx({
      guards: createToolLoopGuards({ searchToolNames: new Set(['web_search']) }),
    });
    const tools = wrapToolsForLoop(
      { web_search: { execute: async () => ({ results: [{ t: 1 }] }) } } as unknown as ToolSet,
      ctx
    );
    ctx.guards.noteCall('web_search');
    const out = (await run(tools, 'web_search', { query: 'x' })) as { results?: unknown[] };
    expect(out.results).toHaveLength(1);
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
  });
});

// Ein zurückgehaltener Aufruf hat NICHT stattgefunden: keine Karte, kein
// persistierter Schritt, keine Ausführung — dieselbe Regel wie beim Guard-Block.
// Eine Karte hier hiesse dem Verlauf gegenüber zu behaupten, das Werkzeug sei
// gelaufen, während die Person noch entscheidet.
describe('wrapToolsForLoop — Freigabe-Gate', () => {
  it('führt nicht aus und zeichnet nichts auf, wenn das Gate hält', async () => {
    const { ctx, events, steps } = makeCtx({
      approvalGate: { hold: () => true },
    });
    const execute = vi.fn(async () => ({ ok: true }));
    const tools = wrapToolsForLoop({ mcp__x: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'mcp__x', { a: 1 })) as { error?: string };

    expect(execute).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    expect(steps).toHaveLength(0);
    expect(out.error).toContain('Freigabe');
  });

  it('reicht Werkzeugname, Aufruf-ID und Argumente ans Gate', async () => {
    const seen: Array<{ toolName: string; stepId: string; args: Record<string, unknown> }> = [];
    const { ctx } = makeCtx({
      approvalGate: {
        hold: (call) => {
          seen.push(call);
          return true;
        },
      },
    });
    const tools = wrapToolsForLoop(
      { mcp__x: { execute: async () => ({}) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'mcp__x', { query: 'berlin' }, 'call_42');

    expect(seen).toEqual([{ toolName: 'mcp__x', stepId: 'call_42', args: { query: 'berlin' } }]);
  });

  it('lässt einen freigegebenen Aufruf ganz normal laufen', async () => {
    const { ctx, events, steps } = makeCtx({ approvalGate: { hold: () => false } });
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ mcp__x: { execute } } as unknown as ToolSet, ctx);

    await run(tools, 'mcp__x', {});

    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.event)).toEqual(['tool_step_start', 'tool_step_result']);
    expect(steps).toHaveLength(1);
  });
});

describe('wrapToolsForLoop — interne Felder', () => {
  it('entfernt rerankDegraded aus dem Modell-Ergebnis, meldet es aber an den Hook', async () => {
    const seen: unknown[] = [];
    const { ctx } = makeCtx({ hooks: { afterToolCall: (e) => seen.push(e.result) } });
    const tools = wrapToolsForLoop(
      {
        gruenerator_search: {
          execute: () => Promise.resolve({ results: [], rerankDegraded: true }),
        },
      } as unknown as ToolSet,
      ctx
    );

    const out = (await run(tools, 'gruenerator_search', { query: 'x' })) as Record<string, unknown>;

    expect(out).not.toHaveProperty('rerankDegraded');
    expect(seen[0]).toMatchObject({ rerankDegraded: true });
  });
});
