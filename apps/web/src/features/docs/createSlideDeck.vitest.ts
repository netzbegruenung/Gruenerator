import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@gruenerator/shared/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
  getContractsClient: () => ({ canvas: { create } }),
}));

const { createSlideDeck } = await import('./createSlideDeck');

beforeEach(() => create.mockReset());

describe('createSlideDeck', () => {
  it('creates a blank 16:9 freeform canvas for Germany', async () => {
    create.mockResolvedValue({ status: 201, body: { id: 'deck-1' } });
    await expect(createSlideDeck('de-DE')).resolves.toEqual({ id: 'deck-1' });
    expect(create).toHaveBeenCalledWith({
      body: {
        title: 'Neue Präsentation',
        template_type: 'freeform',
        format: 'slide-16-9',
        page_count: 1,
      },
    });
  });

  it('uses the Austrian template for de-AT', async () => {
    create.mockResolvedValue({ status: 201, body: { id: 'deck-2' } });
    await createSlideDeck('de-AT');
    expect(create).toHaveBeenCalledWith({
      body: expect.objectContaining({ template_type: 'freeform-at', format: 'slide-16-9' }),
    });
  });

  it('throws when the server refuses', async () => {
    create.mockResolvedValue({ status: 500, body: { error: 'x' } });
    await expect(createSlideDeck('de-DE')).rejects.toThrow('HTTP 500');
  });
});
