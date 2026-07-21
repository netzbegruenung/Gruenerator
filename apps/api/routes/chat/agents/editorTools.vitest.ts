import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeEditArtifactTool, type EditorToolCtx } from './editorTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const generateSheetOperations = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../../sheets/sheetAiService.js', () => ({
  generateSheetOperations: (o: unknown): Promise<unknown> => generateSheetOperations(o),
}));

const generatePresentationOperations = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../../presentations/presentationAiService.js', () => ({
  generatePresentationOperations: (o: unknown): Promise<unknown> =>
    generatePresentationOperations(o),
}));

const generateBoardOperations = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../../boards/boardAiService.js', () => ({
  generateBoardOperations: (o: unknown): Promise<unknown> => generateBoardOperations(o),
}));

type SseEvent = { type: string; payload: unknown };
function fakeSse(sink: SseEvent[]) {
  return {
    send: (type: string, payload: unknown) => sink.push({ type, payload }),
  } as unknown as EditorToolCtx['sse'];
}

function sheetState(overrides?: Partial<ChatGraphState>): ChatGraphState {
  return {
    intent: 'edit_current_doc',
    editToolSurface: 'sheet',
    currentDocument: {
      id: 'sheet-1',
      title: 'Budget',
      markdown: 'A1: Umsatz',
      selectionText: null,
    },
    ...overrides,
  } as unknown as ChatGraphState;
}

function boardState(overrides?: Partial<ChatGraphState>): ChatGraphState {
  return {
    intent: 'edit_current_board',
    editToolSurface: 'board',
    currentBoard: { id: 'board-1', title: 'Kampagne' },
    ...overrides,
  } as unknown as ChatGraphState;
}

function ctx(events: SseEvent[], state: ChatGraphState): EditorToolCtx {
  return { sse: fakeSse(events), state, sourceRegistry: createSourceRegistry(), appliedOpsLog: [] };
}

function exec(tool: unknown, input: unknown) {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

describe('makeEditArtifactTool (sheet)', () => {
  beforeEach(() => {
    generateSheetOperations.mockReset();
    generatePresentationOperations.mockReset();
    generateBoardOperations.mockReset();
  });

  it('is built for plan-and-send surfaces (sheet, presentation, board) only', () => {
    expect(makeEditArtifactTool(ctx([], sheetState()))).not.toBeNull();
    expect(
      makeEditArtifactTool(ctx([], sheetState({ editToolSurface: 'presentation' })))
    ).not.toBeNull();
    expect(makeEditArtifactTool(ctx([], boardState({ editToolSurface: 'board' })))).not.toBeNull();
    // Dispatch-strategy surfaces (docs, canvas) have no plan-and-send tool.
    expect(makeEditArtifactTool(ctx([], sheetState({ editToolSurface: 'canvas' })))).toBeNull();
    expect(makeEditArtifactTool(ctx([], sheetState({ editToolSurface: null })))).toBeNull();
  });

  it('emits editor_operations with surface=board on a planned board edit', async () => {
    generateBoardOperations.mockResolvedValue([{ type: 'create_task', title: 'Neu' }]);
    const events: SseEvent[] = [];
    const out = (await exec(makeEditArtifactTool(ctx(events, boardState()))!, {
      instruction: 'Lege eine Aufgabe an',
    })) as { ok: boolean; operationCount: number };

    expect(out).toMatchObject({ ok: true, operationCount: 1 });
    const emitted = events.find((e) => e.type === 'editor_operations');
    expect((emitted!.payload as { surface: string; targetId: string }).surface).toBe('board');
    expect((emitted!.payload as { targetId: string }).targetId).toBe('board-1');
  });

  it('errors when no board is open', async () => {
    const events: SseEvent[] = [];
    const out = (await exec(
      makeEditArtifactTool(ctx(events, boardState({ currentBoard: null })))!,
      { instruction: 'x' }
    )) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(generateBoardOperations).not.toHaveBeenCalled();
  });

  it('emits editor_operations with surface=presentation on a planned deck edit', async () => {
    generatePresentationOperations.mockResolvedValue([
      { type: 'add_slide', layout: 'content', title: 'Neu', body: '- Punkt' },
    ]);
    const events: SseEvent[] = [];
    const state = sheetState({ editToolSurface: 'presentation' });
    const out = (await exec(makeEditArtifactTool(ctx(events, state))!, {
      instruction: 'Füge eine Folie hinzu',
    })) as { ok: boolean; operationCount: number };

    expect(out).toMatchObject({ ok: true, operationCount: 1 });
    const emitted = events.find((e) => e.type === 'editor_operations');
    expect((emitted!.payload as { surface: string }).surface).toBe('presentation');
  });

  it('emits editor_operations and returns a lean summary on a planned edit', async () => {
    generateSheetOperations.mockResolvedValue([
      { type: 'set_range_values', range: 'B1', values: [[2500]] },
      { type: 'set_number_format', range: 'B1', pattern: '0' },
    ]);
    const events: SseEvent[] = [];
    const c = ctx(events, sheetState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Setze Umsatz auf 2500',
    })) as {
      ok: boolean;
      operationCount: number;
    };

    expect(out).toMatchObject({ ok: true, operationCount: 2 });
    const emitted = events.find((e) => e.type === 'editor_operations');
    expect(emitted).toBeDefined();
    expect((emitted!.payload as { surface: string; targetId: string }).surface).toBe('sheet');
    expect((emitted!.payload as { targetId: string }).targetId).toBe('sheet-1');
    // appliedOpsLog accumulates so a second edit plans on top of the first.
    expect(c.appliedOpsLog).toHaveLength(1);
  });

  it('emits nothing and reports a no-op when the planner returns no ops', async () => {
    generateSheetOperations.mockResolvedValue([]);
    const events: SseEvent[] = [];
    const out = (await exec(makeEditArtifactTool(ctx(events, sheetState()))!, {
      instruction: 'Ändere nichts',
    })) as { ok: boolean; operationCount: number };

    expect(out).toMatchObject({ ok: true, operationCount: 0 });
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
  });

  it('errors when no document is open', async () => {
    const events: SseEvent[] = [];
    const out = (await exec(
      makeEditArtifactTool(ctx(events, sheetState({ currentDocument: null })))!,
      {
        instruction: 'x',
      }
    )) as { error?: string };

    expect(out.error).toBeTruthy();
    expect(generateSheetOperations).not.toHaveBeenCalled();
  });
});
