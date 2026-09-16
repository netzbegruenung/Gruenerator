import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  sharepicEditResponseSchema,
} from '@gruenerator/contracts';
import { response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiTools: vi.fn(),
  query: vi.fn(),
  patch: vi.fn(),
  currentState: vi.fn(),
  version: vi.fn(),
  finish: vi.fn(),
}));
vi.mock('../../../services/ai/generate.js', () => ({ aiTools: mocks.aiTools }));
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

import { runSharepicEdit } from './sharepicEditLlm.js';
import { handleSharepicEdit } from './sharepicEditService.js';
import { SSEWriter } from './sseHelpers.js';

const declined = {
  operations: [],
  summary: 'Keine Änderung möglich – kein konkreter Text angegeben.',
  reply: 'Bitte gib den belegten Wortlaut an, damit ich das Zitat erweitern kann.',
};
const descriptor = getSharepicTemplateDescriptor('zitat')!;
const args = {
  instruction: 'Verlängere das Zitat',
  descriptor,
  snapshot: buildSharepicSnapshot(descriptor, descriptor.defaultState),
  recentEditSummaries: [],
};
function respond(input: Record<string, unknown>) {
  mocks.aiTools.mockResolvedValue({
    tool_calls: [{ name: 'apply_sharepic_edit', input }],
  });
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
    await expect(runSharepicEdit(args)).resolves.toEqual({ ok: false, reply: declined.reply });
    expect(mocks.aiTools).toHaveBeenCalledTimes(1);
  });

  it('still returns actual operations for an actionable edit', async () => {
    const edit = {
      operations: [{ kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Belegter Text' }],
      summary: 'Zitat ersetzt',
      reply: 'Das Zitat ist ersetzt.',
    };
    respond(edit);
    await expect(runSharepicEdit(args)).resolves.toEqual({ ok: true, edit });
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
    const sse = new SSEWriter(response);
    const send = vi.spyOn(sse, 'send').mockImplementation(() => {});
    await handleSharepicEdit({
      sse,
      req: {},
      threadId: 't1',
      userId: 'u1',
      instruction: 'den zitat text verlängern',
      currentSharepic: { variantId: 'v1', canvasId: 'c1', canvasType: 'zitat' },
      startTime: Date.now(),
    });
    expect(mocks.aiTools).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(quote),
        prompt: expect.stringContaining('den zitat text verlängern'),
      })
    );
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
      respond(input);
      const result = await runSharepicEdit(args);
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('error', expect.stringContaining('Schema mismatch'));
    }
  });

  it('finishes with the explanation without patching, versioning or emitting an edit error', async () => {
    const sse = new SSEWriter(response);
    const send = vi.spyOn(sse, 'send').mockImplementation(() => {});
    await expect(
      handleSharepicEdit({
        sse,
        req: {},
        threadId: 't1',
        userId: 'u1',
        instruction: args.instruction,
        currentSharepic: { variantId: 'v1', canvasId: 'c1', canvasType: 'zitat' },
        startTime: Date.now(),
      })
    ).resolves.toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ text: declined.reply }));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.version).not.toHaveBeenCalled();
    expect(send.mock.calls.map(([event]) => event)).not.toContain('sharepic_updated');
    expect(send.mock.calls.map(([event]) => event)).not.toContain('sharepic_edit_error');
  });
});
