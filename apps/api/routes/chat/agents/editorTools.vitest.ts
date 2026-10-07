import {
  currentCanvasSchema,
  editorOperationsEventSchema,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { editToolNameFor } from '../services/agenticLoop/types.js';

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

const draftSharepic = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('../../../services/sharepicCreator/draftAgent.js', () => ({
  draftSharepic: (...a: unknown[]): Promise<unknown> => draftSharepic(...a),
}));

const PAINTERS = { scene: 'scene-painter' };
const paintersFor = vi.fn<(userId: string | null) => unknown>(() => PAINTERS);
vi.mock('../services/sharepicCreatorVariant.js', () => ({
  paintersFor: (userId: string | null): unknown => paintersFor(userId),
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

const slide: SharepicSpec['slides'][number] = {
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: ['Klimaschutz', 'vor Ort'] }],
  logo: false,
};
const deckSpec: SharepicSpec = { locale: 'de-DE', slides: [slide, slide] };

function sharepicCanvasState(overrides?: Partial<ChatGraphState>): ChatGraphState {
  const base = canvasState();
  return {
    ...base,
    userLocale: 'de-AT',
    agentConfig: { userId: 'user-1' },
    currentCanvas: {
      ...base.currentCanvas!,
      template: 'freeform',
      sharepic: { deckSpec, focusSlide: 1, selection: ['sc-0-headline'] },
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

  it('emits editor_operations with surface=canvas and the planned batch', async () => {
    runCanvasSuggest.mockResolvedValue({
      ok: true,
      title: 'Zitat geschärft',
      operations: [
        { kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Tempo jetzt.' },
        { kind: 'set-color-scheme', schemeId: 'sonne' },
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

  it('reports a no-op when the canvas planner returns no operations', async () => {
    runCanvasSuggest.mockResolvedValue({ ok: true, title: 'Nichts', operations: [] });
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
    // Reihenfolge ist nicht Geschmack: der Deckel schneidet den Schwanz ab.
    expect(reference.indexOf('VORHERIGE ANTWORT')).toBeLessThan(
      reference.indexOf('RECHERCHIERTE QUELLEN')
    );
  });

  it('opfert bei vollem Deckel die Quellen, nicht den referenzierten Text', async () => {
    // „füge das ein" zeigt auf die frühere Antwort — genau sie darf der Deckel
    // nicht wegschneiden, während er Quellen behält, die niemand einfügen wollte.
    const events: SseEvent[] = [];
    const priorTurn = `Referenzierte Fassung. ${'Wir fordern mehr Tempo beim Ausbau. '.repeat(300)}`;
    const state = docState({
      messages: [
        { role: 'user', content: 'Schreib mir den Antrag' },
        { role: 'assistant', content: priorTurn },
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
      { source: 'web', title: 'Ausbauzahlen 2026', content: 'x'.repeat(4000) },
    ]);

    await exec(makeEditArtifactTool(c)!, { instruction: 'Füge den Text ein' });
    const reference = (events[0]!.payload as { referenceContent: string }).referenceContent;
    expect(reference.length).toBeLessThanOrEqual(8000);
    // Der referenzierte Text steht am Anfang und füllt den Deckel …
    expect(reference.startsWith('VORHERIGE ANTWORT AUS DIESEM CHAT:\n')).toBe(true);
    expect(reference).toContain(priorTurn.slice(0, 7000));
    // … und was weggeschnitten wird, sind die Quellen.
    expect(reference).not.toContain('RECHERCHIERTE QUELLEN');
    expect(reference).not.toContain('Ausbauzahlen 2026');
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

describe('edit_current_sharepic (creator sharepic, spec path)', () => {
  beforeEach(() => {
    runCanvasSuggest.mockReset();
    draftSharepic.mockReset();
    paintersFor.mockClear();
  });

  it('is the tool name only when the canvas carries a sharepic spec', () => {
    expect(editToolNameFor(sharepicCanvasState())).toBe('edit_current_sharepic');
    expect(editToolNameFor(canvasState())).toBe('edit_document');
    expect(editToolNameFor(sheetState())).toBe('edit_document');
  });

  it('reads an invalid sharepic context as absent, so the canvas keeps the op path', () => {
    const canvas = canvasState().currentCanvas!;
    const parse = (sharepic: unknown) => currentCanvasSchema.parse({ ...canvas, sharepic });

    expect(parse({ deckSpec, focusSlide: 1, selection: [] }).sharepic?.focusSlide).toBe(1);
    expect(parse({ deckSpec, focusSlide: 2, selection: [] }).sharepic).toBeNull();
    expect(parse({ deckSpec: { slides: [] }, focusSlide: 0, selection: [] }).sharepic).toBeNull();
    expect(parse(undefined).sharepic).toBeUndefined();
    const many = Array.from({ length: 51 }, (_, i) => `sc-${i}`);
    expect(parse({ deckSpec, focusSlide: 0, selection: many }).sharepic).toBeNull();
  });

  it('drafts against the deck spec with the focus and emits the spec, not ops', async () => {
    const revised: SharepicSpec = { locale: 'de-DE', slides: [slide, slide, slide] };
    draftSharepic.mockResolvedValue({
      spec: revised,
      chapters: [],
      attributions: [null, null, null],
      hinweis: 'Kein Foto gefunden.',
    });
    const events: SseEvent[] = [];
    const c = ctx(events, sharepicCanvasState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Mach die zweite Folie knapper',
    })) as { ok: boolean };

    expect(out).toMatchObject({ ok: true });
    expect(runCanvasSuggest).not.toHaveBeenCalled();
    expect(paintersFor).toHaveBeenCalledWith('user-1');
    expect(draftSharepic).toHaveBeenCalledWith(
      'Mach die zweite Folie knapper',
      'de-AT',
      deckSpec,
      [],
      PAINTERS,
      null,
      'Mach die zweite Folie knapper',
      { slide: 1, elements: ['sc-0-headline'] },
      'Mach die zweite Folie knapper'
    );

    const emitted = events.filter((e) => e.type === 'editor_operations');
    expect(emitted).toHaveLength(1);
    const parsed = editorOperationsEventSchema.parse(emitted[0]!.payload);
    expect(parsed).toMatchObject({
      surface: 'canvas',
      targetId: 'canvas-1',
      operations: [],
      sharepic: { spec: revised, attributions: [null, null, null], hinweis: 'Kein Foto gefunden.' },
    });
    expect(c.state.editorEditsSummary).toContain('Sharepic');
    // Split mode's writer reads only the summary: the hinweis has to be in it.
    expect(c.state.editorEditsSummary).toContain('Hinweis für die Person: Kein Foto gefunden.');
  });

  it('sends hinweis null and no element hint when nothing is selected', async () => {
    draftSharepic.mockResolvedValue({
      spec: { ...deckSpec, slides: [slide] },
      chapters: [],
      attributions: [null],
    });
    const base = sharepicCanvasState();
    const state = {
      ...base,
      currentCanvas: {
        ...base.currentCanvas!,
        sharepic: { deckSpec, focusSlide: 0, selection: [] },
      },
    } as unknown as ChatGraphState;
    const events: SseEvent[] = [];
    await exec(makeEditArtifactTool(ctx(events, state))!, { instruction: 'Kürzer' });

    expect(draftSharepic.mock.calls[0]![7]).toEqual({ slide: 0 });
    const payload = editorOperationsEventSchema.parse(events[0]!.payload);
    expect(payload.sharepic?.hinweis).toBeNull();
  });

  it("takes the person's own request as the order, not the model's brief", async () => {
    draftSharepic.mockResolvedValue({ spec: deckSpec, chapters: [], attributions: [null, null] });
    const state = sharepicCanvasState({ lastUserTextNoMentions: 'Termin auf den 3. Mai' });
    await exec(makeEditArtifactTool(ctx([], state))!, {
      instruction: 'Ändere das Datum auf den 3. Mai und kürze die Headline',
    });

    expect(draftSharepic.mock.calls[0]![6]).toBe('Termin auf den 3. Mai');
  });

  it("drafts from the person's own words and passes the model's brief only as context", async () => {
    draftSharepic.mockResolvedValue({ spec: deckSpec, chapters: [], attributions: [null, null] });
    const state = sharepicCanvasState({
      lastUserTextNoMentions: 'Füge eine weitere Folie mit einem Fazit hinzu',
    });
    await exec(makeEditArtifactTool(ctx([], state))!, {
      instruction: 'Füge eine Fazit-Folie hinzu. Die Folie soll leer bleiben.',
    });

    const prompt = draftSharepic.mock.calls[0]![0] as string;
    expect(prompt.startsWith('Füge eine weitere Folie mit einem Fazit hinzu\n\n')).toBe(true);
    expect(prompt).toContain('konkretisieren den Wunsch oben');
    expect(prompt).toContain('Die Folie soll leer bleiben.');
    expect(draftSharepic.mock.calls[0]![6]).toBe('Füge eine weitere Folie mit einem Fazit hinzu');
  });

  it('adds no context block when the brief is the request itself', async () => {
    draftSharepic.mockResolvedValue({ spec: deckSpec, chapters: [], attributions: [null, null] });
    const state = sharepicCanvasState({ lastUserTextNoMentions: 'Verschieb den Text nach oben' });
    await exec(makeEditArtifactTool(ctx([], state))!, {
      instruction: 'Verschieb den Text nach oben',
    });

    expect(draftSharepic.mock.calls[0]![0]).toBe('Verschieb den Text nach oben');
  });

  it('keeps the change on a confirmation turn, where the brief carries it', async () => {
    draftSharepic.mockResolvedValue({ spec: deckSpec, chapters: [], attributions: [null, null] });
    const state = sharepicCanvasState({ lastUserTextNoMentions: 'Ja, mach das' });
    await exec(makeEditArtifactTool(ctx([], state))!, {
      instruction: "Headline auf 'Bus statt Stau' ändern",
    });

    const prompt = draftSharepic.mock.calls[0]![0] as string;
    expect(prompt.startsWith('Ja, mach das\n\n')).toBe(true);
    expect(prompt).toContain(
      'bei kurzer Zustimmung wie „ja, mach das“ beschreiben sie die gewünschte Änderung'
    );
    expect(prompt).toContain("Headline auf 'Bus statt Stau' ändern");
    expect(prompt).not.toContain('kein eigener Änderungswunsch');
  });

  it('drops the palette note when nothing changed, keeps the rest', async () => {
    draftSharepic.mockResolvedValue({
      spec: structuredClone(deckSpec),
      chapters: [],
      attributions: [null, null],
      hinweis:
        'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen. Kein Foto gefunden.',
    });
    const out = (await exec(makeEditArtifactTool(ctx([], sharepicCanvasState()))!, {
      instruction: 'Hintergrund auf Sand',
    })) as Record<string, unknown>;
    expect(out.hinweis).toBe('Kein Foto gefunden.');

    draftSharepic.mockResolvedValue({
      spec: structuredClone(deckSpec),
      chapters: [],
      attributions: [null, null],
      hinweis: 'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen.',
    });
    const only = (await exec(makeEditArtifactTool(ctx([], sharepicCanvasState()))!, {
      instruction: 'Hintergrund auf Sand',
    })) as Record<string, unknown>;
    expect(only).toMatchObject({ unchanged: true });
    expect(only.hinweis).toBeUndefined();
  });

  it('says honestly that nothing changed when the draft equals the deck', async () => {
    draftSharepic.mockResolvedValue({
      spec: structuredClone(deckSpec),
      chapters: [],
      attributions: [null, null],
      hinweis: 'Es gibt keine Quellenangabe.',
    });
    const events: SseEvent[] = [];
    const c = ctx(events, sharepicCanvasState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Entferne die Quellenangabe',
    })) as Record<string, unknown>;

    expect(out).toMatchObject({
      ok: true,
      unchanged: true,
      hinweis: 'Es gibt keine Quellenangabe.',
    });
    expect(String(out.note)).toBe(
      'Es wurde NICHTS geändert: Es gibt keine Quellenangabe. Sag das der Person ehrlich und schlag vor, was stattdessen geht.'
    );
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
    expect(c.state.editorEditsSummary).toBeFalsy();
    // Split mode: the writer never sees the tool result, only the state.
    expect(c.state.editorEditUnchanged).toBe(out.note);
  });

  it('answers a retry after an unchanged result honestly, without a failure', async () => {
    draftSharepic.mockResolvedValue({
      spec: structuredClone(deckSpec),
      chapters: [],
      attributions: [null, null],
    });
    const c = ctx([], sharepicCanvasState());
    const tool = makeEditArtifactTool(c)!;
    const first = (await exec(tool, { instruction: 'Mach dieses Element kleiner' })) as Record<
      string,
      unknown
    >;
    const second = (await exec(tool, { instruction: 'Mach es kleiner' })) as Record<
      string,
      unknown
    >;

    expect(second.error).toBeUndefined();
    expect(JSON.stringify(second)).not.toContain('überarbeitet');
    expect(second).toMatchObject({ ok: true, unchanged: true });
    expect(String(second.note)).toMatch(/^Es wurde NICHTS geändert/);
    expect(first.note).toBeDefined();
  });

  it('refuses a third call after an unchanged then a changed draft, without the unchanged note', async () => {
    const changed = { ...deckSpec, slides: [...deckSpec.slides, deckSpec.slides[0]!] };
    draftSharepic
      .mockResolvedValueOnce({
        spec: structuredClone(deckSpec),
        chapters: [],
        attributions: [null, null],
      })
      .mockResolvedValueOnce({ spec: changed, chapters: [], attributions: [null, null] });
    const c = ctx([], sharepicCanvasState());
    const tool = makeEditArtifactTool(c)!;
    await exec(tool, { instruction: 'Mach dieses Element kleiner' });
    await exec(tool, { instruction: 'Mach die Headline kürzer' });
    const third = (await exec(tool, { instruction: 'Noch kürzer' })) as Record<string, unknown>;

    expect(String(third.error)).toContain('schon überarbeitet');
    expect(third.unchanged).toBeUndefined();
    expect(c.state.editorEditUnchanged).toBeFalsy();
  });

  it('names a reason even when the draft gave none', async () => {
    draftSharepic.mockResolvedValue({
      spec: structuredClone(deckSpec),
      chapters: [],
      attributions: [null, null],
    });
    const c = ctx([], sharepicCanvasState());
    const out = (await exec(makeEditArtifactTool(c)!, {
      instruction: 'Mach dieses Element kleiner',
    })) as Record<string, unknown>;

    expect(String(out.note)).toMatch(/^Es wurde NICHTS geändert: .+\. Sag das der Person ehrlich/);
    expect(c.state.editorEditUnchanged).toBe(out.note);
  });

  it('contains a failed draft like the canvas planner (no event emitted)', async () => {
    draftSharepic.mockRejectedValue(new Error('needs: invalid'));
    const events: SseEvent[] = [];
    const out = (await exec(makeEditArtifactTool(ctx(events, sharepicCanvasState()))!, {
      instruction: 'Mach irgendwas',
    })) as { error?: string };

    expect(out.error).toContain('konnte nicht geplant werden');
    expect(events.find((e) => e.type === 'editor_operations')).toBeUndefined();
  });

  it('emits nothing when the loop already abandoned the call (timeout)', async () => {
    draftSharepic.mockResolvedValue({ spec: deckSpec, chapters: [], attributions: [null, null] });
    const abandoned = new AbortController();
    abandoned.abort();
    const events: SseEvent[] = [];
    const tool = makeEditArtifactTool(ctx(events, sharepicCanvasState())) as unknown as {
      execute: (
        i: unknown,
        o: { toolCallId: string; abortSignal: AbortSignal }
      ) => Promise<unknown>;
    };
    await tool.execute(
      { instruction: 'Kürzer' },
      { toolCallId: 'c1', abortSignal: abandoned.signal }
    );

    expect(events).toHaveLength(0);
  });

  it('refuses a retry while the written-off first draft is still running', async () => {
    let finish: (v: unknown) => void = () => {};
    draftSharepic.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const events: SseEvent[] = [];
    const tool = makeEditArtifactTool(ctx(events, sharepicCanvasState()))!;
    const first = exec(tool, { instruction: 'Kürzer' });
    const retry = (await exec(tool, { instruction: 'Kürzer' })) as { error?: string };

    expect(retry.error).toBeDefined();
    expect(draftSharepic).toHaveBeenCalledTimes(1);
    finish({ spec: deckSpec, chapters: [], attributions: [null, null] });
    await first;
  });

  it('allows a retry after a failed draft', async () => {
    draftSharepic.mockRejectedValueOnce(new Error('needs: invalid')).mockResolvedValueOnce({
      spec: deckSpec,
      chapters: [],
      attributions: [null, null],
    });
    const events: SseEvent[] = [];
    const tool = makeEditArtifactTool(ctx(events, sharepicCanvasState()))!;
    await exec(tool, { instruction: 'Kürzer' });
    const retry = (await exec(tool, { instruction: 'Kürzer' })) as { error?: string };

    expect(retry.error).toBeUndefined();
    expect(draftSharepic).toHaveBeenCalledTimes(2);
  });

  it('refuses a second spec edit in the same turn', async () => {
    // A real change: an unchanged draft frees the turn for another try.
    const changed = { ...deckSpec, slides: [...deckSpec.slides, deckSpec.slides[0]!] };
    draftSharepic.mockResolvedValue({ spec: changed, chapters: [], attributions: [null, null] });
    const events: SseEvent[] = [];
    const tool = makeEditArtifactTool(ctx(events, sharepicCanvasState()))!;
    await exec(tool, { instruction: 'Kürzer' });
    const second = (await exec(tool, { instruction: 'Noch kürzer' })) as { error?: string };

    expect(second.error).toBeDefined();
    expect(draftSharepic).toHaveBeenCalledTimes(1);
  });
});
