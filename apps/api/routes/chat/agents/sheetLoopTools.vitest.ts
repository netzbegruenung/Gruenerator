import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const mocks = vi.hoisted(() => ({
  loadSheetState: vi.fn<(...a: unknown[]) => unknown>(),
  formatSheetAsContext: vi.fn<(...a: unknown[]) => unknown>(),
  planAndQueueSheetEdit: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../../../services/sheets/SheetGenerationService.js', () => ({
  loadSheetState: (...a: unknown[]) => mocks.loadSheetState(...a),
  formatSheetAsContext: (...a: unknown[]) => mocks.formatSheetAsContext(...a),
}));
vi.mock('../services/sheetEditCore.js', () => ({
  planAndQueueSheetEdit: (...a: unknown[]) => mocks.planAndQueueSheetEdit(...a),
  queuedSheetEditText: () => 'eingetragen-text',
}));

const { hasThreadSheet, makeEditSheetTool, makeReadSheetTool, resolveLoopSheetId } =
  await import('./sheetLoopTools.js');

const stateWith = (over: Record<string, unknown> = {}) =>
  ({
    agentConfig: { userId: 'u1' },
    threadArtifacts: [
      { kind: 'sheet', ref: 'new' },
      { kind: 'sharepic', ref: 'sp' },
      { kind: 'sheet', ref: 'old' },
    ],
    messages: [{ role: 'user', content: 'ja' }],
    ...over,
  }) as unknown as ChatGraphState;

const run = (t: unknown, input: unknown) =>
  (t as { execute: (i: unknown, o?: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    {}
  );

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe('resolveLoopSheetId', () => {
  it('picks the newest sheet (list is newest first)', () => {
    expect(resolveLoopSheetId(stateWith())).toBe('new');
  });
  it('takes an explicit id from this thread, the newest for a foreign one', () => {
    expect(resolveLoopSheetId(stateWith(), 'old')).toBe('old');
    expect(resolveLoopSheetId(stateWith(), 'foreign')).toBe('new');
  });
  it('returns null without sheets', () => {
    expect(resolveLoopSheetId(stateWith({ threadArtifacts: [] }))).toBeNull();
    expect(resolveLoopSheetId(stateWith({ threadArtifacts: undefined }))).toBeNull();
  });
});

describe('hasThreadSheet', () => {
  it('detects a sheet by last-turn editables or artifacts', () => {
    expect(hasThreadSheet(stateWith({ threadArtifacts: [], lastTurnEditables: ['sheet'] }))).toBe(
      true
    );
    expect(hasThreadSheet(stateWith())).toBe(true);
    expect(hasThreadSheet(stateWith({ threadArtifacts: [] }))).toBe(false);
  });
});

describe('read_sheet', () => {
  it('returns the formatted content', async () => {
    mocks.loadSheetState.mockResolvedValue({ title: 'T' });
    mocks.formatSheetAsContext.mockReturnValue('A1: 5');
    const out = await run(makeReadSheetTool({ state: stateWith(), threadId: 't1' }), {});
    expect(out).toEqual({ sheetId: 'new', inhalt: 'A1: 5' });
    expect(mocks.loadSheetState).toHaveBeenCalledWith('new', 'u1');
  });
  it('errors without a sheet', async () => {
    const out = await run(
      makeReadSheetTool({ state: stateWith({ threadArtifacts: [] }), threadId: 't1' }),
      {}
    );
    expect(out.error).toBeTruthy();
    expect(mocks.loadSheetState).not.toHaveBeenCalled();
  });
  it('errors when the sheet cannot be loaded', async () => {
    mocks.loadSheetState.mockResolvedValue(null);
    const out = await run(makeReadSheetTool({ state: stateWith(), threadId: 't1' }), {});
    expect(out.error).toContain('nicht gefunden');
  });
});

describe('edit_sheet', () => {
  const tool = (state = stateWith()) => makeEditSheetTool({ state, threadId: 't1' });

  it('reports a queued edit', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({
      status: 'queued',
      title: 'T',
      summary: 's',
      live: true,
      operationCount: 2,
    });
    const out = await run(tool(), { anweisung: 'fett', confirm: false });
    expect(out).toEqual({ ok: true, sheetId: 'new', operationCount: 2, note: 'eingetragen-text' });
    expect(mocks.planAndQueueSheetEdit).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'new', userId: 'u1', destructiveAllowed: false })
    );
  });

  it('asks back on destructive plans', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({
      status: 'needs_confirmation',
      title: 'T',
      summary: '1× delete_columns',
    });
    const out = await run(tool(), { anweisung: 'x', confirm: false });
    expect(out).toMatchObject({ needsConfirmation: true });
    expect(String(out.note)).toContain('delete_columns');
  });

  it('surfaces failures as error', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({ status: 'failed', message: 'kaputt' });
    expect(await run(tool(), { anweisung: 'x', confirm: false })).toEqual({ error: 'kaputt' });
  });

  it('errors without a sheet', async () => {
    const out = await run(tool(stateWith({ threadArtifacts: [] })), {
      anweisung: 'x',
      confirm: false,
    });
    expect(out.error).toBeTruthy();
    expect(mocks.planAndQueueSheetEdit).not.toHaveBeenCalled();
  });

  it('refuses confirm=true without user agreement', async () => {
    const state = stateWith({ messages: [{ role: 'user', content: 'Mach es bunter' }] });
    const out = await run(tool(state), { anweisung: 'x', confirm: true });
    expect(out.error).toContain('nicht zugestimmt');
    expect(mocks.planAndQueueSheetEdit).not.toHaveBeenCalled();
  });

  it('allows destructive ops after the user said ja', async () => {
    mocks.planAndQueueSheetEdit.mockResolvedValue({
      status: 'queued',
      title: 'T',
      summary: 's',
      live: false,
      operationCount: 1,
    });
    const out = await run(tool(), { anweisung: 'x', confirm: true });
    expect(out).toMatchObject({ ok: true });
    expect(mocks.planAndQueueSheetEdit).toHaveBeenCalledWith(
      expect.objectContaining({ destructiveAllowed: true })
    );
  });
});
