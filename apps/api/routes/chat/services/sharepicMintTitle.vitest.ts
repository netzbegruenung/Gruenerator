import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mintCanvasForVariant } from './sharepicEditService.js';

const { mockQuery, mockCreateCanvas } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCreateCanvas: vi.fn(),
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));
vi.mock('../../../services/canvas/canvasRepository.js', () => ({
  createCanvas: mockCreateCanvas,
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  applyCanvasStatePatch: vi.fn(),
  applyDeckChanges: vi.fn(),
  getCurrentCanvasState: vi.fn(),
  seedCanvasPages: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: vi.fn(),
  listCanvasVersions: vi.fn(),
}));
vi.mock('../../../services/image/ImageSelectionService.js', () => ({ default: {} }));

const base = {
  userId: 'u1',
  threadId: 't1',
  variantId: 'v1',
  messageId: null,
  existingCanvasId: null,
};

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([]);
  mockCreateCanvas.mockReset().mockResolvedValue({ id: 'c1' });
});

describe('mintCanvasForVariant — title', () => {
  it('uses the title the client derived from the creator spec', async () => {
    await mintCanvasForVariant({
      ...base,
      canvasType: 'freeform',
      initialProps: { pages: [{ id: 'seed-0', configId: 'freeform', state: {} }] },
      format: 'post-portrait-tall',
      title: 'Busse statt Stau',
    });
    expect(mockCreateCanvas).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Busse statt Stau' })
    );
  });

  it('derives the title from template props without one', async () => {
    await mintCanvasForVariant({
      ...base,
      canvasType: 'dreizeilen',
      initialProps: { line1: 'Tempo 30 rettet Leben' },
      format: null,
      title: null,
    });
    expect(mockCreateCanvas).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Tempo 30 rettet Leben' })
    );
  });

  it('keeps the fallback for composed pages without a title', async () => {
    await mintCanvasForVariant({
      ...base,
      canvasType: 'freeform',
      initialProps: { pages: [{ id: 'seed-0', configId: 'freeform', state: {} }] },
      format: 'post-portrait-tall',
      title: null,
    });
    expect(mockCreateCanvas).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Sharepic aus dem Chat' })
    );
  });
});
