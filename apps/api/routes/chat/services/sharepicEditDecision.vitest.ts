/**
 * The chat's sharepic_edit decisions on the shared op planner (#4251):
 * a reasoned decline, a real edit, malformed answers, and a request the
 * template can only partly do.
 */
import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  sharepicEditResponseSchema,
} from '@gruenerator/contracts';
import { response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeProvider: vi.fn(),
  query: vi.fn(),
  patch: vi.fn(),
  currentState: vi.fn(),
  version: vi.fn(),
  finish: vi.fn(),
}));
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: mocks.executeProvider,
}));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mocks.query }),
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  getCurrentCanvasState: mocks.currentState,
  applyCanvasStatePatch: mocks.patch,
  seedCanvasPages: vi.fn(),
  applyDeckChanges: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  listCanvasVersions: vi.fn().mockResolvedValue([]),
  insertCanvasVersion: mocks.version,
}));
vi.mock('./editTurnCompletion.js', () => ({ finishEditTurn: mocks.finish }));

import { sharepicCapabilitiesView } from '../../canvas/services/buildCanvasSuggestPrompt.js';
import { runCanvasEditDecision } from '../../canvas/services/runCanvasSuggest.js';

import { handleSharepicEdit } from './sharepicEditService.js';
import { SSEWriter } from './sseHelpers.js';

const TOOL_NAME = 'submit_canvas_operations';

const declined = {
  operations: [],
  summary: 'Keine Änderung möglich – kein konkreter Text angegeben.',
  reply: 'Bitte gib den belegten Wortlaut an, damit ich das Zitat erweitern kann.',
};
const descriptor = getSharepicTemplateDescriptor('zitat')!;
const plannerArgs = {
  prompt: 'Verlängere das Zitat',
  snapshot: buildSharepicSnapshot(descriptor, descriptor.defaultState),
  capabilities: sharepicCapabilitiesView(descriptor),
  chatEdit: { recentEditSummaries: [] },
};

/** Successive attempts answer with the given tool payloads, the last one repeating. */
function respond(...payloads: Record<string, unknown>[]) {
  let i = 0;
  mocks.executeProvider.mockImplementation(() => {
    const input = payloads[Math.min(i++, payloads.length - 1)];
    return Promise.resolve({
      content: null,
      success: true,
      stop_reason: 'tool_use',
      tool_calls: [{ name: TOOL_NAME, input }],
    });
  });
}

type SentRequest = { messages: { content: string }[]; systemPrompt?: string };
const sent = (call: number): SentRequest =>
  mocks.executeProvider.mock.calls[call]![2] as SentRequest;

function editTurn(instruction: string) {
  const sse = new SSEWriter(response);
  const send = vi.spyOn(sse, 'send').mockImplementation(() => {});
  const run = handleSharepicEdit({
    sse,
    req: {},
    threadId: 't1',
    userId: 'u1',
    instruction,
    currentSharepic: { variantId: 'v1', canvasId: 'c1', canvasType: 'zitat' },
    startTime: Date.now(),
  });
  return { run, events: () => send.mock.calls.map(([event]) => event), send };
}

beforeEach(() => {
  vi.clearAllMocks();
  respond(declined);
  mocks.currentState.mockResolvedValue({ state: {}, source: 'initial_state' });
  mocks.version.mockResolvedValue(2);
  mocks.query.mockResolvedValue([
    { variant_id: 'v1', canvas_id: 'c1', canvas_type: 'zitat', is_active: true },
  ]);
});

describe('sharepic edit decisions', () => {
  it('accepts a reasoned decline without retrying or weakening applied edits', async () => {
    expect(sharepicEditResponseSchema.safeParse(declined).success).toBe(false);
    await expect(runCanvasEditDecision(plannerArgs)).resolves.toEqual({
      ok: true,
      operations: [],
      summary: declined.summary,
      reply: declined.reply,
      dropped: [],
    });
    expect(mocks.executeProvider).toHaveBeenCalledTimes(1);
  });

  it('still returns actual operations for an actionable edit', async () => {
    const edit = {
      operations: [{ kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Belegter Text' }],
      summary: 'Zitat ersetzt',
      reply: 'Das Zitat ist ersetzt.',
    };
    respond(edit);
    await expect(runCanvasEditDecision(plannerArgs)).resolves.toEqual({
      ok: true,
      ...edit,
      dropped: [],
    });
  });

  it('extends the selected sidebar draft and persists and broadcasts its new text', async () => {
    const quote = 'Jedes Kind verdient ein kühles Klassenzimmer.';
    const extended = `${quote} Wir setzen uns für wirksamen Hitzeschutz an unseren Schulen ein, damit Kinder auch an heißen Tagen gut lernen können.`;
    mocks.currentState.mockResolvedValue({ state: { quote, name: 'Alex' }, source: 'yjs' });
    respond({
      operations: [{ kind: 'set-text', field: 'quote', label: 'Zitat', value: extended }],
      summary: 'Zitattext verlängert',
      reply: 'Ich habe den Zitattext verlängert.',
    });
    const { run, send } = editTurn('den zitat text verlängern');
    await run;
    expect(sent(0).systemPrompt).toContain(quote);
    expect(
      sent(0)
        .messages.map((m) => m.content)
        .join('\n')
    ).toContain('den zitat text verlängern');
    expect(mocks.patch).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ quote: extended }),
      expect.anything()
    );
    expect(mocks.version).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ quote: extended, name: 'Alex' }),
        origin: 'chat-edit',
      })
    );
    expect(send).toHaveBeenCalledWith(
      'sharepic_updated',
      expect.objectContaining({ variantId: 'v1', canvasId: 'c1', version: 2 })
    );
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Ich habe den Zitattext verlängert.' })
    );
  });

  it('rejects empty decisions without a reply and malformed operations', async () => {
    for (const input of [
      { ...declined, reply: '' },
      { ...declined, operations: [{}] },
    ]) {
      mocks.executeProvider.mockClear();
      respond(input);
      const result = await runCanvasEditDecision(plannerArgs);
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('error', expect.stringContaining('Schema mismatch'));
      // One repair turn that names the problem, then it gives up.
      expect(mocks.executeProvider).toHaveBeenCalledTimes(2);
    }
  });

  it('finishes with the explanation without patching, versioning or emitting an edit error', async () => {
    const { run, events } = editTurn('Verlängere das Zitat');
    await expect(run).resolves.toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ text: declined.reply }));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.version).not.toHaveBeenCalled();
    expect(events()).not.toContain('sharepic_updated');
    expect(events()).not.toContain('sharepic_edit_error');
  });

  it('reports a planner failure as an edit error without patching', async () => {
    respond({ operations: 'kaputt' });
    const { run, events } = editTurn('Verlängere das Zitat');
    await run;
    expect(events()).toContain('sharepic_edit_error');
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});

/**
 * 11.08.2026: `dreizeilen-overlay-at` got a `set-background-color` it cannot
 * do, the validator dropped it, and the chat confirmed the new background.
 * The planner drops an unsupported kind; the reply must still name it.
 */
describe('a partly unsupported request', () => {
  it('applies the supported part and names the rest instead of confirming it', async () => {
    expect(descriptor.supportedOperations).not.toContain('set-background-image');
    respond({
      operations: [
        { kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Neuer Text' },
        { kind: 'set-background-image', query: 'Windräder' },
      ],
      summary: 'Zitat und Hintergrund geändert',
      reply: 'Ich habe das Zitat und den Hintergrund geändert.',
    });
    const { run } = editTurn('Neuer Text und ein Windrad-Hintergrund');
    await run;

    expect(mocks.patch).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ quote: 'Neuer Text' }),
      expect.anything()
    );
    const text = (mocks.finish.mock.calls[0]![0] as { text: string }).text;
    expect(text).toContain('Nicht übernommen');
    expect(text).toContain('set-background-image');
    expect(text).toContain('Studio');
  });

  it('turns a batch of only unsupported kinds into a repair that may decline', async () => {
    respond(
      {
        operations: [{ kind: 'set-background-image', query: 'Windräder' }],
        summary: 'Hintergrund',
        reply: 'Erledigt.',
      },
      {
        operations: [],
        summary: 'Keine Änderung',
        reply: 'Das Hintergrundbild lässt sich bei dieser Vorlage nur im Studio ändern.',
      }
    );
    const { run, events } = editTurn('Mach einen Windrad-Hintergrund');
    await run;

    expect(mocks.executeProvider).toHaveBeenCalledTimes(2);
    const repair = sent(1)
      .messages.map((m) => m.content)
      .join('\n');
    expect(repair).toMatch(/keine unterstützte Operation/);
    expect(repair).toContain('"operations": []');
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(events()).not.toContain('sharepic_edit_error');
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Das Hintergrundbild lässt sich bei dieser Vorlage nur im Studio ändern.',
      })
    );
  });
});
