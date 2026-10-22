/**
 * Which canvas a chat sharepic variant is bound to decides where the next chat
 * edit lands — and the edit reads and patches that canvas past the canvas ACL.
 * So only a variant the thread holds is bound, a read-only caller never binds,
 * and the edit flow never works on a canvas the editing user may not write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SSEWriter } from './sseHelpers.js';

const { mockQuery, mockCreateCanvas, mockCheckWrite } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCreateCanvas: vi.fn(),
  mockCheckWrite: vi.fn(),
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));
vi.mock('../../../services/canvas/canvasRepository.js', () => ({
  createCanvas: mockCreateCanvas,
  checkCanvasWriteAccess: mockCheckWrite,
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  applyCanvasStatePatch: vi.fn(),
  getCurrentCanvasState: vi.fn(),
  seedCanvasPages: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: vi.fn(),
  listCanvasVersions: vi.fn(),
}));
vi.mock('../../../services/image/ImageSelectionService.js', () => ({ default: {} }));

const { mintCanvasForVariant, ensureMintedCanvas } = await import('./sharepicEditService.js');

const THREAD = 't1';
const VARIANT = 'm1-v1';

/** The thread's sharepic message, holding `VARIANT`. */
const SHAREPIC_MESSAGE = {
  id: 'm1',
  tool_results: {
    toolCalls: [
      {
        toolName: 'sharepic',
        result: {
          variants: [{ id: VARIANT, canvasType: 'dreizeilen', initialProps: { line1: 'Echt' } }],
        },
      },
    ],
  },
};

let boundCanvas: string | null;

function sqlOf(call: unknown[]): string {
  return String(call[0]);
}
const writesToBindings = (): unknown[][] =>
  mockQuery.mock.calls.filter((c) =>
    /^\s*(INSERT INTO|UPDATE) chat_thread_canvases/.test(sqlOf(c))
  );

beforeEach(() => {
  boundCanvas = null;
  mockQuery.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT canvas_id FROM chat_thread_canvases')) {
      return boundCanvas ? [{ canvas_id: boundCanvas }] : [];
    }
    if (sql.includes('SELECT id, tool_results FROM chat_messages')) return [SHAREPIC_MESSAGE];
    if (sql.includes('SELECT tool_results FROM chat_messages')) {
      return [{ tool_results: SHAREPIC_MESSAGE.tool_results }];
    }
    return [];
  });
  mockCreateCanvas.mockReset().mockResolvedValue({ id: 'c-new' });
  mockCheckWrite.mockReset().mockResolvedValue({ kind: 'ok' });
});

const mintArgs = {
  userId: 'u1',
  threadId: THREAD,
  canvasType: 'dreizeilen',
  initialProps: { line1: 'Vom Client' },
  messageId: null,
  existingCanvasId: null,
  format: null,
  title: null,
};

describe('mintCanvasForVariant — binding', () => {
  it('binds and activates a variant the thread holds', async () => {
    const res = await mintCanvasForVariant({ ...mintArgs, variantId: VARIANT, bindToThread: true });

    expect(res).toEqual({ canvasId: 'c-new', minted: true });
    expect(writesToBindings()).toHaveLength(2);
  });

  it('does not bind a variant id the thread does not hold', async () => {
    const res = await mintCanvasForVariant({
      ...mintArgs,
      variantId: 'made-up',
      bindToThread: true,
    });

    expect(res).toEqual({ canvasId: 'c-new', minted: true });
    expect(mockCreateCanvas).toHaveBeenCalledWith('u1', expect.anything());
    expect(writesToBindings()).toEqual([]);
  });

  it('gives a read-only caller a canvas of their own and leaves the thread alone', async () => {
    boundCanvas = 'c-owner';

    const res = await mintCanvasForVariant({
      ...mintArgs,
      variantId: VARIANT,
      bindToThread: false,
    });

    expect(res).toEqual({ canvasId: 'c-new', minted: true });
    expect(writesToBindings()).toEqual([]);
  });
});

describe('ensureMintedCanvas — canvas write access', () => {
  const sse = { send: vi.fn(), isEnded: () => false } as unknown as SSEWriter;
  const target = {
    variantId: VARIANT,
    canvasId: 'c-foreign',
    canvasType: 'dreizeilen',
    initialProps: {},
    messageId: null,
  };

  it('keeps the bound canvas when the user may write it', async () => {
    const canvasId = await ensureMintedCanvas({ target, threadId: THREAD, userId: 'u1', sse });

    expect(canvasId).toBe('c-foreign');
    expect(mockCheckWrite).toHaveBeenCalledWith('c-foreign', 'u1');
    expect(mockCreateCanvas).not.toHaveBeenCalled();
  });

  it('re-mints from the variant instead of using a canvas the user may not write', async () => {
    mockCheckWrite.mockResolvedValue({ kind: 'forbidden' });

    const canvasId = await ensureMintedCanvas({ target, threadId: THREAD, userId: 'u1', sse });

    expect(canvasId).toBe('c-new');
    expect(mockCreateCanvas).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ initial_state: expect.objectContaining({ line1: 'Echt' }) })
    );
    // The binding now points at the user's canvas, so the next turn does not hit the foreign one.
    const rebind = writesToBindings().find((c) => sqlOf(c).includes('canvas_id = EXCLUDED'));
    expect(rebind?.[1]).toEqual([THREAD, VARIANT, 'c-new', 'dreizeilen']);
  });
});
