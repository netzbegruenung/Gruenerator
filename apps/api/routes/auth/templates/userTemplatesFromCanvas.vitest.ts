/**
 * Freezing a canvas as a Vorlage reads its live state. A canvas newer than the server cannot be
 * read completely, so nothing is frozen (409) instead of an incomplete snapshot being stored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn<(...a: unknown[]) => unknown>(),
  createCanvas: vi.fn<(...a: unknown[]) => unknown>(),
  getCanvasSnapshotState: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: vi.fn(), query: vi.fn(), insert: vi.fn() }),
}));
vi.mock('../../../services/canvas/canvasRepository.js', () => ({
  getCanvas: (...a: unknown[]) => mocks.getCanvas(...a),
  createCanvas: (...a: unknown[]) => mocks.createCanvas(...a),
  markCanvasAsGalleryTemplate: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasStateService.js', async () => ({
  getCanvasSnapshotState: (...a: unknown[]) => mocks.getCanvasSnapshotState(...a),
  CanvasDocumentNewerReadError: (await import('../../../services/canvas/canvasWriteErrors.js'))
    .CanvasDocumentNewerReadError,
}));

const { CanvasDocumentNewerReadError } =
  await import('../../../services/canvas/canvasWriteErrors.js');
const { userTemplatesContractRouter } = await import('./userTemplatesContractRouter.js');

const fromCanvas = (
  userTemplatesContractRouter as unknown as {
    fromCanvas: (a: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
  }
).fromCanvas;

const req = { user: { id: 'user-1', email: 'u@example.org' } } as never;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getCanvas.mockResolvedValue({
    kind: 'ok',
    canvas: { template_type: 'freeform', format: 'post-portrait', title: 'T', page_count: 1 },
  });
});

describe('userTemplates.fromCanvas', () => {
  it('answers 409 with a German message and freezes nothing for a canvas newer than the server', async () => {
    mocks.getCanvasSnapshotState.mockRejectedValue(new CanvasDocumentNewerReadError('c1'));

    const res = await fromCanvas({
      req,
      body: { canvasId: 'c1', preview_image_url: 'https://example.org/p.png', images: [] },
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false });
    expect(String(res.body.message)).toMatch(/neueres Format.*Vorlage/);
    expect(mocks.createCanvas).not.toHaveBeenCalled();
  });
});
