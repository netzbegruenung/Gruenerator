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
