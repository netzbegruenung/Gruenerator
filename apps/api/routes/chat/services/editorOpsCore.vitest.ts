/**
 * Pins the steps shared by the two editor-edit callers (edit_sheet and the
 * loop's edit_document tool).
 *
 * The summary format and the `editor_operations` payload are the parts that must
 * not drift: the payload is an F0-frozen wire event with a client-side applier
 * per surface, and the summary reaches both the user's narration and the loop
 * model's view of what it just did.
 */

import { describe, expect, it, vi } from 'vitest';

import { emitEditorOperations, planEditorOps, summarizeEditorOps } from './editorOpsCore.js';

function makeSse() {
  return { send: vi.fn(), sendRaw: vi.fn(), end: vi.fn() };
}

function makeLog() {
  return { error: vi.fn() };
}

describe('summarizeEditorOps', () => {
  it('counts per type and keeps first-seen order', () => {
    expect(
      summarizeEditorOps([{ type: 'set_cell' }, { type: 'format_range' }, { type: 'set_cell' }])
    ).toBe('2× set_cell, 1× format_range');
  });

  it('is empty for an empty batch', () => {
    expect(summarizeEditorOps([])).toBe('');
  });
});

describe('planEditorOps', () => {
  it('returns the operations with their summary', async () => {
    const result = await planEditorOps({
      log: makeLog(),
      logLabel: '[SheetEdit]',
      plan: async () => [{ type: 'format_range' }],
    });

    expect(result).toEqual({
      ok: true,
      operations: [{ type: 'format_range' }],
      summary: '1× format_range',
    });
  });

  it('reports planning_failed and logs with the caller label when the planner throws', async () => {
    const log = makeLog();
    const result = await planEditorOps({
      log,
      logLabel: '[EditorTool] sheet',
      plan: async () => {
        throw new Error('mistral down');
      },
    });

    expect(result).toEqual({ ok: false, reason: 'planning_failed' });
    expect(log.error).toHaveBeenCalledWith('[EditorTool] sheet planning failed: mistral down');
  });

  it('reports no_operations for an empty plan without logging an error', async () => {
    const log = makeLog();
    const result = await planEditorOps({ log, logLabel: '[SheetEdit]', plan: async () => [] });

    expect(result).toEqual({ ok: false, reason: 'no_operations' });
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe('emitEditorOperations', () => {
  it('sends the frozen editor_operations payload', () => {
    const sse = makeSse();
    const operations = [{ type: 'add_slide' }];

    emitEditorOperations(
      sse as unknown as Parameters<typeof emitEditorOperations>[0],
      'presentation',
      'doc-1',
      operations,
      '1× add_slide'
    );

    expect(sse.send).toHaveBeenCalledWith('editor_operations', {
      surface: 'presentation',
      targetId: 'doc-1',
      operations,
      summary: '1× add_slide',
    });
  });
});
