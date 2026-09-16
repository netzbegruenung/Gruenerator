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

const runCanvasSuggest = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../../canvas/services/runCanvasSuggest.js', () => ({
  runCanvasSuggest: (o: unknown): Promise<unknown> => runCanvasSuggest(o),
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

function canvasState(overrides?: Partial<ChatGraphState>): ChatGraphState {
  return {
    intent: 'agentic',
    editToolSurface: 'canvas',
    currentCanvas: {
      id: 'canvas-1',
      template: 'zitat',
      snapshot: { template: 'zitat', textFields: [], elementsSummary: [] },
      capabilities: { supportedOperations: ['set-text'] },
      text: 'Zitat: „Mehr Tempo beim Ausbau."',
    },
    ...overrides,
  } as unknown as ChatGraphState;
}

function docState(overrides?: Partial<ChatGraphState>): ChatGraphState {
  return {
    intent: 'edit_current_doc',
    editToolSurface: 'doc',
    messages: [{ role: 'user', content: 'Kürze den ersten Absatz' }],
    currentDocument: {
      id: 'doc-1',
      title: 'Antrag',
      markdown: '# Antrag\n\nLanger erster Absatz.',
      selectionText: null,
    },
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
    runCanvasSuggest.mockReset();
  });

  it('is built for every resolved surface, and only for a resolved one', () => {
    expect(makeEditArtifactTool(ctx([], sheetState()))).not.toBeNull();
    expect(
      makeEditArtifactTool(ctx([], sheetState({ editToolSurface: 'presentation' })))
    ).not.toBeNull();
    expect(makeEditArtifactTool(ctx([], boardState({ editToolSurface: 'board' })))).not.toBeNull();
    expect(makeEditArtifactTool(ctx([], canvasState()))).not.toBeNull();
    // `doc` is built too since #3428 — it dispatches instead of planning.
    expect(makeEditArtifactTool(ctx([], docState()))).not.toBeNull();
    expect(makeEditArtifactTool(ctx([], sheetState({ editToolSurface: null })))).toBeNull();
  });

  it('emits editor_operations with surface=canvas and the FIRST suggestion ops', async () => {
    runCanvasSuggest.mockResolvedValue({
      ok: true,
      suggestions: [
        {
          id: 's1',
          title: 'Zitat geschärft',
          operations: [
            { kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Tempo jetzt.' },
            { kind: 'set-color-scheme', schemeId: 'sonne' },
          ],
        },
        { id: 's2', title: 'Zweiter Vorschlag', operations: [{ kind: 'toggle-sunflower' }] },
      ],
    });
    const events: SseEvent[] = [];
    const c = ctx(events, canvasState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Mach das Zitat schlagkräftiger',
    })) as { ok: boolean; operationCount: number };

    expect(out).toMatchObject({ ok: true, operationCount: 2 });
    const emitted = events.find((e) => e.type === 'editor_operations');
    const payload = emitted!.payload as {
      surface: string;
      targetId: string;
      summary: string;
      operations: Array<{ kind: string }>;
    };
    expect(payload.surface).toBe('canvas');
    expect(payload.targetId).toBe('canvas-1');
    expect(payload.operations.map((o) => o.kind)).toEqual(['set-text', 'set-color-scheme']);
    // The suggestion's own German title, not the "2× set-text" op tally — this
    // string is what the studio's Behalten/Verwerfen banner prints.
    expect(payload.summary).toBe('Zitat geschärft');
    // Der Turn-Merkzettel trägt BEIDES: den Namen und die Op-Arten. Ein zweiter
    // edit_document-Aufruf plant gegen einen veralteten Server-Snapshot und
    // muss wissen, WAS geändert wurde — „Zitat geschärft" allein sagt das nicht.
    expect(c.appliedOpsLog).toEqual([
      '2 Op(s): Zitat geschärft — 1× set-text, 1× set-color-scheme',
    ]);
  });

  it('errors when no sharepic is open', async () => {
    const events: SseEvent[] = [];
    const out = (await exec(
      makeEditArtifactTool(ctx(events, canvasState({ currentCanvas: null })))!,
      { instruction: 'x' }
    )) as { error?: string };
    expect(out.error).toContain('Sharepic');
    expect(runCanvasSuggest).not.toHaveBeenCalled();
  });

  it('contains a failed canvas planner as planning_failed (no event emitted)', async () => {
    runCanvasSuggest.mockResolvedValue({ ok: false, error: 'Schema mismatch: kind' });
    const events: SseEvent[] = [];
    const out = (await exec(makeEditArtifactTool(ctx(events, canvasState()))!, {
      instruction: 'Mach irgendwas',
    })) as { error?: string };

    expect(out.error).toContain('konnte nicht geplant werden');
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
  });

  it('reports a no-op when the canvas planner returns no suggestion', async () => {
    runCanvasSuggest.mockResolvedValue({ ok: true, suggestions: [] });
    const events: SseEvent[] = [];
    const out = (await exec(makeEditArtifactTool(ctx(events, canvasState()))!, {
      instruction: 'Ändere nichts',
    })) as { ok: boolean; operationCount: number };

    expect(out).toMatchObject({ ok: true, operationCount: 0 });
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
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

describe('makeEditArtifactTool (doc — dispatch strategy)', () => {
  const LONG_ANSWER = `Der überarbeitete Antrag lautet: ${'Wir fordern mehr Tempo beim Ausbau. '.repeat(10)}`;

  it('dispatches trigger_doc_edit with the MODEL instruction, not the user text', async () => {
    const events: SseEvent[] = [];
    const c = ctx(events, docState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Kürze den ersten Absatz auf zwei Sätze und behalte die Forderung.',
    })) as { ok: boolean; dispatched: boolean; note: string };

    expect(out).toMatchObject({ ok: true, dispatched: true });
    expect(out.note).toContain('Vorschlag');
    const emitted = events.find((e) => e.type === 'trigger_doc_edit');
    const payload = emitted!.payload as {
      targetDocumentId: string;
      userPrompt: string;
      useSelection: boolean;
      referenceContent?: string;
    };
    expect(payload.targetDocumentId).toBe('doc-1');
    // The whole point of the move: the instruction is the MODEL's, so the raw
    // ask ("Kürze den ersten Absatz") is no longer what reaches BlockNote.
    expect(payload.userPrompt).toBe(
      'Kürze den ersten Absatz auf zwei Sätze und behalte die Forderung.'
    );
    expect(payload.useSelection).toBe(false);
    expect(payload.referenceContent).toBeUndefined();
    // Nothing is planned server-side on this surface.
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
    expect(c.appliedOpsLog).toEqual([
      'Bearbeitung angestoßen: Kürze den ersten Absatz auf zwei Sätze und behalte die Forderung.',
    ]);
    expect(c.state.editorEditsSummary).toContain('Bearbeitung am Dokument angestoßen');
  });

  it('derives useSelection from the open document selection', async () => {
    const events: SseEvent[] = [];
    const state = docState({
      currentDocument: {
        id: 'doc-1',
        title: 'Antrag',
        markdown: '# Antrag',
        selectionText: 'Dieser Satz ist markiert.',
      } as never,
    });
    await exec(makeEditArtifactTool(ctx(events, state))!, { instruction: 'Mach das knapper' });
    expect((events[0]!.payload as { useSelection: boolean }).useSelection).toBe(true);
  });

  it('carries BOTH reference channels — the loop sources and the prior assistant turn', async () => {
    const events: SseEvent[] = [];
    const state = docState({
      messages: [
        { role: 'user', content: 'Schreib mir den Antrag' },
        { role: 'assistant', content: LONG_ANSWER },
        { role: 'user', content: 'Füge das ins Dokument ein' },
      ] as never,
    });
    const c: EditorToolCtx = {
      sse: fakeSse(events),
      state,
      sourceRegistry: createSourceRegistry(),
      appliedOpsLog: [],
    };
    c.sourceRegistry.register([
      { source: 'web', title: 'Ausbauzahlen 2026', content: '12,4 GW zugebaut.' },
    ]);

    await exec(makeEditArtifactTool(c)!, { instruction: 'Bau die Zahlen ein' });
    const reference = (events[0]!.payload as { referenceContent: string }).referenceContent;
    expect(reference).toContain('RECHERCHIERTE QUELLEN:');
    expect(reference).toContain('12,4 GW zugebaut.');
    expect(reference).toContain('VORHERIGE ANTWORT AUS DIESEM CHAT:');
    expect(reference).toContain('Wir fordern mehr Tempo beim Ausbau.');
  });

  it('refuses a SECOND dispatch in the same turn instead of forking twice', async () => {
    // The client neither queues nor rejects: invokeDocumentAI's in-flight Set is
    // a signal for the review UI, so a second invoke would fork the Y.Doc while
    // the first fork is still being written into.
    const events: SseEvent[] = [];
    const c = ctx(events, docState());
    const editTool = makeEditArtifactTool(c)!;
    await exec(editTool, { instruction: 'Kürze den ersten Absatz' });
    const second = (await exec(editTool, { instruction: 'Und jetzt den zweiten' })) as {
      error?: string;
    };

    expect(second.error).toContain('Es läuft bereits eine Bearbeitung am Dokument');
    expect(events.filter((e) => e.type === 'trigger_doc_edit')).toHaveLength(1);
  });

  it('errors when no document is open', async () => {
    const events: SseEvent[] = [];
    const out = (await exec(
      makeEditArtifactTool(ctx(events, docState({ currentDocument: null })))!,
      {
        instruction: 'x',
      }
    )) as { error?: string };

    expect(out.error).toContain('Dokument');
    expect(events).toHaveLength(0);
  });
});
