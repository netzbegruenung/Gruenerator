import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn<(...a: unknown[]) => unknown>(),
  cloneCanvas: vi.fn<(...a: unknown[]) => unknown>(),
  getCanvasSnapshotState: vi.fn<(...a: unknown[]) => unknown>(),
  getCurrentCanvasState: vi.fn<(...a: unknown[]) => unknown>(),
  getCurrentDeckState: vi.fn<(...a: unknown[]) => unknown>(),
  seedCanvasPages: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('./services/canvasAiCheck.js', () => ({ checkCanvasEdit: vi.fn() }));
vi.mock('../chat/services/sharepicEditService.js', () => ({ mintCanvasForVariant: vi.fn() }));
vi.mock('../chat/services/threadAccessService.js', () => ({ getThreadAccessLevel: vi.fn() }));
vi.mock('../../services/canvas/canvasRepository.js', () => ({
  getCanvas: (...a: unknown[]) => mocks.getCanvas(...a),
  cloneCanvas: (...a: unknown[]) => mocks.cloneCanvas(...a),
}));
vi.mock('../../services/canvas/canvasStateService.js', () => ({
  getCanvasSnapshotState: mocks.getCanvasSnapshotState,
  getCurrentCanvasState: (...a: unknown[]) => mocks.getCurrentCanvasState(...a),
  getCurrentDeckState: (...a: unknown[]) => mocks.getCurrentDeckState(...a),
  seedCanvasPages: (...a: unknown[]) => mocks.seedCanvasPages(...a),
}));
vi.mock('../../services/canvas/canvasVersionRepository.js', () => ({
  getLatestCanvasVersionNumber: async () => 3,
}));

const { CanvasDocumentNewerReadError } = await import('../../services/canvas/canvasWriteErrors.js');
const { canvasContractRouter } = await import('./canvasContractRouter.js');

type Handler = (a: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
const req = { user: { id: 'user-1', email: 'u@example.org' } } as never;
const call = (name: 'clone' | 'getState') =>
  (canvasContractRouter[name] as unknown as Handler)({ req, params: { id: 'c1' } });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getCanvas.mockResolvedValue({ kind: 'ok', canvas: { template_type: 'dreizeilen' } });
});

describe('canvas.clone', () => {
  it('copies the live state and seeds the copy like a canvas created from a template', async () => {
    const seededState = {
      headline: 'Live',
      pages: [{ id: 'p1', configId: 'freeform', state: {} }],
    };
    mocks.cloneCanvas.mockResolvedValue({
      kind: 'ok',
      newCanvasId: 'c2',
      accessMethod: 'owner',
      templateType: 'freeform',
      seededState,
    });

    const res = await call('clone');

    // The repository gets the live-state reader (it calls it after the access check).
    expect(mocks.cloneCanvas).toHaveBeenCalledWith('c1', 'user-1', mocks.getCanvasSnapshotState);
    expect(mocks.seedCanvasPages).toHaveBeenCalledWith('c2', 'freeform', seededState);
    expect(res).toEqual({ status: 201, body: { newCanvasId: 'c2', accessMethod: 'owner' } });
  });

  it('answers a source newer than the server with 409 and its code, and seeds nothing', async () => {
    mocks.cloneCanvas.mockRejectedValue(new CanvasDocumentNewerReadError('c1'));

    const res = await call('clone');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CANVAS_DOCUMENT_NEWER' });
    expect(String(res.body.error)).toMatch(/neueres Format/);
    expect(mocks.seedCanvasPages).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['forbidden', 403],
  ])('answers %s with %i and seeds nothing', async (kind, status) => {
    mocks.cloneCanvas.mockResolvedValue({ kind });
    expect((await call('clone')).status).toBe(status);
    expect(mocks.seedCanvasPages).not.toHaveBeenCalled();
  });
});

describe('canvas.getState', () => {
  it('answers a document newer than the server with 409 and its code', async () => {
    mocks.getCurrentCanvasState.mockRejectedValue(new CanvasDocumentNewerReadError('c1'));

    const res = await call('getState');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CANVAS_DOCUMENT_NEWER' });
  });

  it('still answers the state of a document it can read', async () => {
    mocks.getCurrentCanvasState.mockResolvedValue({ state: { a: 1 }, source: 'yjs' });

    const res = await call('getState');

    expect(res).toEqual({ status: 200, body: { state: { a: 1 }, source: 'yjs', version: 3 } });
  });
});
