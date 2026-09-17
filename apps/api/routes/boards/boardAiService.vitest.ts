/**
 * `generateBoardOperations` moved onto the AI facade (lane `editor_ops_board`,
 * via the shared `runForcedToolCall` in services/ai/forcedToolCall.ts) as
 * part of #3426. These tests attrap the facade entry point (`aiTools`), not
 * the AI SDK — the same seam `toolForcedEdit.vitest.ts` uses for its sibling
 * driver — and run the REAL (unmocked) helper against it, so they cover the
 * board-specific behaviour: validated ops on the happy path, the 50-op cap,
 * per-op rejection, the 300-row board cap, and that the create-only prompt
 * and RECHERCHIERTE QUELLEN section still reach the model. The retry/no-tool-
 * call/throw mechanics of the shared helper itself are tested once, generically,
 * in services/ai/__tests__/forcedToolCall.vitest.ts — not duplicated here.
 */
import { type CurrentBoard } from '@gruenerator/contracts';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const aiTools = vi.fn();
vi.mock('../../services/ai/generate.js', () => ({
  aiTools: (...args: unknown[]) => aiTools(...args),
}));

const { generateBoardOperations } = await import('./boardAiService.js');

function makeBoard(overrides: Partial<CurrentBoard> = {}): CurrentBoard {
  return {
    id: 'board-1',
    title: 'Testboard',
    boardType: 'kanban',
    fields: [],
    rows: [],
    views: [],
    statusOptions: [],
    assignableMembers: [],
    ...overrides,
  };
}

/** A tool-call-shaped `aiTools` resolution (`AiResult`), the transport
 *  `runForcedToolCall` reads. */
function toolCallResult(operations: unknown[]) {
  return {
    success: true,
    content: null,
    stop_reason: 'tool_use',
    tool_calls: [{ name: 'applyBoardOperations', input: { operations } }],
  };
}

function lastCallArgs() {
  return aiTools.mock.calls.at(-1)?.[0] as {
    lane: string;
    system: string;
    prompt: string;
    tools: Array<{ name: string }>;
    toolChoice: string;
    temperature: number;
  };
}

beforeEach(() => {
  aiTools.mockReset();
});

describe('generateBoardOperations', () => {
  it('(a) returns validated ops on the happy path', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([{ type: 'create_task', title: 'Neu' }]));

    const ops = await generateBoardOperations({
      userPrompt: 'lege eine Aufgabe "Neu" an',
      board: makeBoard(),
      today: '2026-09-17',
    });

    expect(ops).toEqual([{ type: 'create_task', title: 'Neu' }]);

    // Routed through the facade on the dedicated lane, forced single tool call.
    const call = lastCallArgs();
    expect(call.lane).toBe('editor_ops_board');
    expect(call.tools[0].name).toBe('applyBoardOperations');
    expect(call.toolChoice).toBe('required');
    expect(call.temperature).toBe(0.2);
    expect(aiTools).toHaveBeenCalledTimes(1);
  });

  it('(b) rejects the whole batch when it exceeds the 50-op cap', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      type: 'create_task',
      title: `Aufgabe ${i}`,
    }));
    aiTools.mockResolvedValueOnce(toolCallResult(tooMany));

    const ops = await generateBoardOperations({
      userPrompt: 'lege 51 Aufgaben an',
      board: makeBoard(),
      today: '2026-09-17',
    });

    expect(ops).toEqual([]);
  });

  it('(c) rejects the whole batch on an invalid op shape', async () => {
    // `create_task` requires `title` — omitting it fails the discriminated
    // union, which fails the whole-array `safeParse` (no per-op leniency for
    // boards, unlike sheet/presentation).
    aiTools.mockResolvedValueOnce(toolCallResult([{ type: 'create_task' }]));

    const ops = await generateBoardOperations({
      userPrompt: 'lege eine Aufgabe an',
      board: makeBoard(),
      today: '2026-09-17',
    });

    expect(ops).toEqual([]);
  });

  it('(d) serializeBoard caps rows at 300 and lists select fields', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([]));

    const rows = Array.from({ length: 305 }, (_, i) => ({
      id: `row-${i}`,
      cells: { 'field-title': `Aufgabe ${i}` },
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    await generateBoardOperations({
      userPrompt: 'was gibt es?',
      board: makeBoard({
        rows,
        fields: [
          {
            id: 'field-prio',
            name: 'Priorität',
            type: 'singleSelect',
            typeOptions: { options: [{ name: 'Hoch' }, { name: 'Niedrig' }] },
            order: 0,
          },
        ],
      }),
      today: '2026-09-17',
    });

    const { system } = lastCallArgs();
    expect(system).toContain('Aufgabe 0');
    expect(system).toContain('Aufgabe 299');
    expect(system).not.toContain('Aufgabe 300');
    expect(system).toContain('(5 weitere Aufgaben ausgelassen)');
    expect(system).toContain('Weitere Auswahlfelder');
    expect(system).toContain('Priorität: Hoch, Niedrig');
  });

  it('(e) sends the create-only strict prompt', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([]));

    await generateBoardOperations({
      userPrompt: 'ändere die Aufgabe X',
      board: makeBoard(),
      today: '2026-09-17',
    });

    const { system } = lastCallArgs();
    expect(system).toContain(
      'you may ONLY CREATE NEW things in the board. You must NOT modify, move,'
    );
  });

  it('(f) puts referenceContent under RECHERCHIERTE QUELLEN', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([]));

    await generateBoardOperations({
      userPrompt: 'lege eine Aufgabe mit den Fakten an',
      board: makeBoard(),
      referenceContent: 'Der Anteil liegt bei 42 Prozent.',
      today: '2026-09-17',
    });

    const { system } = lastCallArgs();
    expect(system).toContain('RECHERCHIERTE QUELLEN');
    expect(system).toContain('Der Anteil liegt bei 42 Prozent.');
  });

  it('(g) serializeBoard lists existing views with layout and grouping field', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([]));

    await generateBoardOperations({
      userPrompt: 'leg eine Kalenderansicht an',
      board: makeBoard({
        fields: [
          {
            id: 'field-status',
            name: 'Status',
            type: 'singleSelect',
            typeOptions: { options: [] },
            order: 0,
          },
        ],
        views: [
          {
            id: 'v1',
            name: 'Kanban',
            layout: 'kanban',
            groupByFieldId: 'field-status',
            filters: [],
            sorts: [],
            fieldSettings: [],
          },
          { id: 'v2', name: 'Alle', layout: 'table', filters: [], sorts: [], fieldSettings: [] },
        ],
      }),
      today: '2026-09-17',
    });

    const { system } = lastCallArgs();
    expect(system).toContain('Ansichten');
    expect(system).toContain('- Kanban (kanban, gruppiert nach Status)');
    expect(system).toContain('- Alle (table)');
  });

  it('(h) serializeBoard says so when the board has no views', async () => {
    aiTools.mockResolvedValueOnce(toolCallResult([]));
    await generateBoardOperations({ userPrompt: 'x', board: makeBoard(), today: '2026-09-17' });
    expect(lastCallArgs().system).toMatch(/Ansichten[^\n]*\n- \(keine\)/);
  });
});
