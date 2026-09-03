/**
 * `memory` against a fake service — no Postgres, no Qdrant. The numbers the
 * model addresses are the ones the prompt rendered (`state.memories`), plus
 * whatever this turn saved; every outcome must reach the source registry as a
 * NOTE (the split-mode writer reads only that), never as a citable source.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeMemoryTool } from './memoryTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { UserMemoryRow } from '../../../database/schema/index.js';
import type { RenderedMemory } from '../../../services/memory/index.js';
import type { MemoryToolCtx } from './memoryTools.js';

type ToolResult = Record<string, unknown>;

function row(id: string, kind: 'anweisung' | 'fakt', text: string): UserMemoryRow {
  return {
    id,
    user_id: 'u1',
    kind,
    text,
    source: 'chat',
    thread_id: null,
    created_at: new Date('2026-08-12'),
    updated_at: new Date('2026-08-12'),
  };
}

function rendered(
  id: string,
  nr: number,
  kind: 'anweisung' | 'fakt',
  text: string
): RenderedMemory {
  return { nr, id, kind, text, updatedAt: new Date('2026-08-12') };
}

function makeCtx(opts: { memories?: RenderedMemory[]; userId?: string | null } = {}) {
  const create = vi.fn(async (input: { kind: 'anweisung' | 'fakt'; text: string }) => ({
    row: row('new-1', input.kind, input.text.trim()),
    duplicate: false,
  }));
  const update = vi.fn(async (_u: string, id: string, text: string) => row(id, 'anweisung', text));
  const remove = vi.fn(async (_u: string, id: string) => row(id, 'fakt', 'weg'));
  const sourceRegistry = createSourceRegistry();
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'u1' : opts.userId },
    memories: opts.memories ?? null,
  } as unknown as ChatGraphState;
  const ctx: MemoryToolCtx = {
    state,
    threadId: 't1',
    sourceRegistry,
    service: { create, update, remove },
  };
  const tool = makeMemoryTool(ctx);
  const run = (input: Record<string, unknown>) =>
    (tool.execute as (i: unknown, o: unknown) => Promise<ToolResult>)(input, {
      toolCallId: 'c1',
      messages: [],
    });
  return { run, create, update, remove, sourceRegistry };
}

describe('memory tool — save', () => {
  it('saves with the next number and notes the outcome for the writer', async () => {
    const { run, create, sourceRegistry } = makeCtx({
      memories: [rendered('a', 1, 'anweisung', 'Immer Du-Form.')],
    });
    const res = await run({ action: 'save', kind: 'fakt', text: 'Schreibt für den KV Köln.' });
    expect(res).toMatchObject({
      gespeichert: true,
      nr: 2,
      kind: 'fakt',
      text: 'Schreibt für den KV Köln.',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', kind: 'fakt', source: 'chat', threadId: 't1' })
    );
    // A note, not a source: it must not count as research material.
    expect(sourceRegistry.size).toBe(0);
    expect(sourceRegistry.renderAll()).toContain('Schreibt für den KV Köln.');
  });

  it('reports a duplicate as already remembered instead of a fresh save', async () => {
    const { run, create } = makeCtx({ memories: [rendered('a', 1, 'fakt', 'Aus Köln.')] });
    create.mockResolvedValueOnce({ row: row('a', 'fakt', 'Aus Köln.'), duplicate: true });
    const res = await run({ action: 'save', kind: 'fakt', text: 'aus köln.' });
    expect(res).toMatchObject({ gespeichert: true, nr: 1 });
    expect(typeof res.hinweis).toBe('string');
  });

  it('refuses a save without kind or text, and without a session', async () => {
    const { run, create } = makeCtx();
    expect(await run({ action: 'save', text: 'x' })).toHaveProperty('error');
    expect(await run({ action: 'save', kind: 'fakt' })).toHaveProperty('error');
    expect(create).not.toHaveBeenCalled();
    const anon = makeCtx({ userId: null });
    expect(await anon.run({ action: 'save', kind: 'fakt', text: 'x' })).toHaveProperty('error');
  });

  it('turns a service rejection into a readable error, not a throw', async () => {
    const { run, create } = makeCtx();
    const { MemoryRejectedError } = await import('../../../services/memory/index.js');
    create.mockRejectedValueOnce(new MemoryRejectedError('full', 'Das Gedächtnis ist voll.'));
    expect(await run({ action: 'save', kind: 'fakt', text: 'x' })).toEqual({
      error: 'Das Gedächtnis ist voll.',
    });
  });
});

describe('memory tool — update / forget by number', () => {
  it('resolves a rendered number to its row id', async () => {
    const { run, update, remove, sourceRegistry } = makeCtx({
      memories: [
        rendered('a', 1, 'anweisung', 'Immer Du-Form.'),
        rendered('f', 2, 'fakt', 'Aus Köln.'),
      ],
    });
    expect(await run({ action: 'update', nr: 1, text: 'Immer Sie-Form.' })).toMatchObject({
      aktualisiert: true,
      nr: 1,
      text: 'Immer Sie-Form.',
    });
    expect(update).toHaveBeenCalledWith('u1', 'a', 'Immer Sie-Form.');
    expect(await run({ action: 'forget', nr: 2 })).toMatchObject({ vergessen: true, nr: 2 });
    expect(remove).toHaveBeenCalledWith('u1', 'f');
    expect(sourceRegistry.renderAll()).toContain('Vergessen');
  });

  it('rejects a number the prompt never rendered', async () => {
    const { run, remove } = makeCtx({ memories: [rendered('a', 1, 'anweisung', 'x')] });
    const res = await run({ action: 'forget', nr: 7 });
    expect(res.error).toMatch(/Nr\. 7/);
    expect(remove).not.toHaveBeenCalled();
    expect(await run({ action: 'update', text: 'y' })).toHaveProperty('error');
  });

  it('can forget what it saved earlier in the same turn', async () => {
    const { run, remove } = makeCtx();
    const saved = await run({ action: 'save', kind: 'fakt', text: 'Aus Köln.' });
    expect(saved.nr).toBe(1);
    expect(await run({ action: 'forget', nr: 1 })).toMatchObject({ vergessen: true });
    expect(remove).toHaveBeenCalledWith('u1', 'new-1');
  });

  it('reports a row that vanished between prompt and call', async () => {
    const { run, update } = makeCtx({ memories: [rendered('a', 1, 'anweisung', 'x')] });
    update.mockResolvedValueOnce(null);
    expect(await run({ action: 'update', nr: 1, text: 'y' })).toHaveProperty('error');
  });
});
