import { describe, it, expect, vi } from 'vitest';

import { createToolLoopGuards } from './loopGuards.js';
import { createToolCostLedger } from './toolCostLedger.js';
import { wrapToolsForLoop, type WrapToolsContext } from './wrapTools.js';

import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

function makeCtx(overrides: Partial<WrapToolsContext> = {}): WrapToolsContext {
  const sse = { send: () => {} } as unknown as SSEWriter;
  return {
    sse,
    guards: createToolLoopGuards(),
    recordStep: () => {},
    perCallTimeoutMs: 1000,
    ...overrides,
  };
}

function run(tools: ToolSet, name: string, input: unknown, callId = 'call_1'): Promise<unknown> {
  const exec = (
    tools[name] as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }
  ).execute;
  return exec(input, { toolCallId: callId });
}

describe('createToolCostLedger', () => {
  it('bucht Aufrufe und Wartezeit je Werkzeug', () => {
    const ledger = createToolCostLedger({ onInfo: () => {} });
    const after = ledger.hooks.afterToolCall;
    const base = { args: {}, stepId: 'c1', result: {}, mocked: false };
    after?.({ ...base, toolName: 'web_search', ok: true, durationMs: 100 });
    after?.({ ...base, toolName: 'web_search', ok: false, durationMs: 50 });
    after?.({ ...base, toolName: 'documents', ok: true, durationMs: 400 });

    // Absteigend nach Wartezeit — das teuerste Werkzeug zuerst.
    expect(ledger.entries()).toEqual([
      { toolName: 'documents', calls: 1, failures: 0, mocked: 0, waitMs: 400 },
      { toolName: 'web_search', calls: 2, failures: 1, mocked: 0, waitMs: 150 },
    ]);
    expect(ledger.totals()).toEqual({ calls: 3, failures: 1, mocked: 0, waitMs: 550 });
  });

  it('schweigt, wenn im Turn kein Werkzeug lief', () => {
    const onInfo = vi.fn();
    createToolCostLedger({ onInfo }).log();
    expect(onInfo).not.toHaveBeenCalled();
  });

  it('schreibt eine Zeile mit Summe und Aufschlüsselung', () => {
    const onInfo = vi.fn();
    const ledger = createToolCostLedger({ onInfo });
    ledger.hooks.afterToolCall?.({
      toolName: 'web_search',
      args: {},
      stepId: 'c1',
      result: {},
      ok: false,
      mocked: false,
      durationMs: 120,
    });
    ledger.log();
    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo.mock.calls[0][0]).toBe(
      '[Agentic] toolCost calls=1 failed=1 waitMs=120 [web_search=1×/120ms/1✗]'
    );
  });

  it('weist Attrappen getrennt aus, damit ein Eval-Lauf nicht wie ein echter aussieht', () => {
    const onInfo = vi.fn();
    const ledger = createToolCostLedger({ onInfo });
    ledger.hooks.afterToolCall?.({
      toolName: 'web_search',
      args: {},
      stepId: 'c1',
      result: {},
      ok: true,
      mocked: true,
      durationMs: 0,
    });
    ledger.log();
    expect(onInfo.mock.calls[0][0]).toContain('mocked=1');
    expect(ledger.totals().mocked).toBe(1);
  });

  /**
   * Der Grund, warum die Buchführung an der Naht hängt und nicht an den Guards:
   * ein geblockter Aufruf hat nicht stattgefunden und darf keine Kosten
   * erzeugen. Zählte er mit, meldete ein Turn mit hartnäckigem Planer Kosten,
   * die nie angefallen sind.
   */
  it('zählt einen guard-geblockten Aufruf nicht', async () => {
    const ledger = createToolCostLedger({ onInfo: () => {} });
    const ctx = makeCtx({ hooks: ledger.hooks });
    ctx.guards.noteFailure('search');
    ctx.guards.noteFailure('search'); // am Limit
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(ledger.totals().calls).toBe(0);
  });

  it('bucht einen echten Aufruf über die Naht', async () => {
    const ledger = createToolCostLedger({ onInfo: () => {} });
    const ctx = makeCtx({ hooks: ledger.hooks });
    const tools = wrapToolsForLoop(
      { search: { execute: async () => ({ results: [1] }) } } as unknown as ToolSet,
      ctx
    );
    await run(tools, 'search', { query: 'x' });
    expect(ledger.totals()).toMatchObject({ calls: 1, failures: 0, mocked: 0 });
    expect(ledger.entries()[0].toolName).toBe('search');
  });
});
