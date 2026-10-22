import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
const remove = vi.fn();
vi.mock('@gruenerator/shared/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
  getContractsClient: () => ({ canvas: { update, remove } }),
}));

const { deleteCanvasDeck, isCanvasDeck, renameCanvasDeck } = await import('./canvasDeckActions');

beforeEach(() => {
  update.mockReset();
  remove.mockReset();
});

describe('canvas deck card actions', () => {
  it('only canvas rows are decks; docs stay on the docs path', () => {
    expect(isCanvasDeck('canvas')).toBe(true);
    for (const s of ['blank', 'presentations', 'sheets', null, undefined]) {
      expect(isCanvasDeck(s)).toBe(false);
    }
  });

  it('renames through the canvas endpoint', async () => {
    update.mockResolvedValue({ status: 200, body: { message: 'ok' } });
    await renameCanvasDeck('deck-1', 'Neu');
    expect(update).toHaveBeenCalledWith({ params: { id: 'deck-1' }, body: { title: 'Neu' } });
  });

  it('deletes through the canvas endpoint and surfaces failures', async () => {
    remove.mockResolvedValue({ status: 200, body: { message: 'ok' } });
    await deleteCanvasDeck('deck-1');
    expect(remove).toHaveBeenCalledWith({ params: { id: 'deck-1' } });
    remove.mockResolvedValue({ status: 404, body: { error: 'x' } });
    await expect(deleteCanvasDeck('deck-1')).rejects.toThrow('HTTP 404');
    update.mockResolvedValue({ status: 403, body: { error: 'x' } });
    await expect(renameCanvasDeck('deck-1', 'x')).rejects.toThrow('HTTP 403');
  });
});
