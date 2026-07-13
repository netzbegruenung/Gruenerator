import { describe, it, expect, vi } from 'vitest';

import { createToolLoopGuards } from './loopGuards.js';
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

  it('short-circuits when the per-tool failure cap is already reached', async () => {
    const { ctx, steps } = makeCtx();
    ctx.guards.noteFailure('search');
    ctx.guards.noteFailure('search'); // now at cap (2)
    const execute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop({ search: { execute } } as unknown as ToolSet, ctx);

    const out = (await run(tools, 'search', { query: 'x' })) as { error: string };
    expect(out.error).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    // The blocked call is still recorded as a step so the UI reflects it.
    expect(steps).toHaveLength(1);
  });

  it('search-budget-blocked call emits card + step but never executes or counts', async () => {
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
    expect(out.error).toMatch(/Genug Belege/);
    expect(execute).toHaveBeenCalledTimes(1); // second call never executed
    expect(events.filter((e) => e.event === 'tool_step_start')).toHaveLength(2);
    expect(steps).toHaveLength(2);
    // The blocked call didn't advance the budget counter further (still capped, not negative).
    expect(ctx.guards.checkSearchBudget('web_search')).not.toBeNull();
  });

  it('internal-first blocks web_search until gruenerator_search executed', async () => {
    const { ctx } = makeCtx({
      guards: createToolLoopGuards({
        internalFirst: {
          requiredTool: 'gruenerator_search',
          gatedTools: new Set(['web_search']),
          exempt: false,
        },
      }),
    });
    const webExecute = vi.fn(async () => ({ results: [] }));
    const internalExecute = vi.fn(async () => ({ results: [] }));
    const tools = wrapToolsForLoop(
      {
        web_search: { execute: webExecute },
        gruenerator_search: { execute: internalExecute },
      } as unknown as ToolSet,
      ctx
    );

    const blocked = (await run(tools, 'web_search', { query: 'x' })) as { error: string };
    expect(blocked.error).toMatch(/zuerst gruenerator_search/);
    expect(webExecute).not.toHaveBeenCalled();

    await run(tools, 'gruenerator_search', { query: 'x' }, 'call_2');
    const allowed = (await run(tools, 'web_search', { query: 'x' }, 'call_3')) as {
      results: unknown[];
    };
    expect(allowed.results).toEqual([]);
    expect(webExecute).toHaveBeenCalledTimes(1);
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
});
