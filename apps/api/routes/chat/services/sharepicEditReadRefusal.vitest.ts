import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentCanvasState: vi.fn<(...a: unknown[]) => unknown>(),
  finishEditTurn: vi.fn<(...a: unknown[]) => unknown>(),
}));

const row = { variant_id: 'v1', canvas_id: 'c1', canvas_type: 'dreizeilen', is_active: true };
const anyMethod = (sql?: unknown) =>
  typeof sql === 'string' && /FROM chat_thread_canvases/.test(sql) ? [row] : [];
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => new Proxy({}, { get: () => async (sql?: unknown) => anyMethod(sql) }),
}));
vi.mock('../../../services/canvas/canvasRepository.js', () => ({
  checkCanvasWriteAccess: async () => ({ kind: 'ok' }),
  createCanvas: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  applyCanvasStatePatch: vi.fn(),
  getCurrentCanvasState: (...a: unknown[]) => mocks.getCurrentCanvasState(...a),
  seedCanvasPages: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: vi.fn(),
  listCanvasVersions: vi.fn(async () => []),
}));
vi.mock('./editTurnCompletion.js', () => ({
  finishEditTurn: (...a: unknown[]) => mocks.finishEditTurn(...a),
}));
vi.mock('../../canvas/services/runCanvasSuggest.js', () => ({
  runCanvasEditDecision: vi.fn(),
}));
vi.mock('sharp', () => ({ default: vi.fn() }));

const { CanvasDocumentNewerReadError } =
  await import('../../../services/canvas/canvasWriteErrors.js');
const { handleSharepicEdit } = await import('./sharepicEditService.js');
const { runCanvasEditDecision } = await import('../../canvas/services/runCanvasSuggest.js');

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.finishEditTurn.mockResolvedValue(undefined);
});

describe('handleSharepicEdit with a canvas newer than the server', () => {
  it('answers with the refusal sentence and never asks the model to edit partial state', async () => {
    const error = new CanvasDocumentNewerReadError('c1');
    mocks.getCurrentCanvasState.mockRejectedValue(error);
    const sse = { send: vi.fn(), isEnded: () => false };

    const handled = await handleSharepicEdit({
      sse: sse as never,
      req: {},
      threadId: 't1',
      userId: 'u1',
      instruction: 'Mach die Überschrift größer',
      currentSharepic: { variantId: 'v1', canvasId: 'c1', canvasType: 'dreizeilen' },
      startTime: Date.now(),
    });

    expect(handled).toBe(true);
    expect(runCanvasEditDecision).not.toHaveBeenCalled();
    expect(sse.send).toHaveBeenCalledWith(
      'sharepic_edit_error',
      expect.objectContaining({ error: error.message })
    );
    expect(mocks.finishEditTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: error.message })
    );
  });
});
