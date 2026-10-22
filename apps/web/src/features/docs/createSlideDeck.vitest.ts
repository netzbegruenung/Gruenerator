import { buildSlideLayout, type SlideLayoutState } from '@gruenerator/canvas-editor/slides';
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
  it('creates a 16:9 freeform canvas seeded with the title slide for Germany', async () => {
    create.mockResolvedValue({ status: 201, body: { id: 'deck-1' } });
    await expect(createSlideDeck('de-DE')).resolves.toEqual({ id: 'deck-1' });
    const { body } = create.mock.calls[0]![0] as { body: Record<string, unknown> };
    expect(body).toMatchObject({
      title: 'Neue Präsentation',
      template_type: 'freeform',
      format: 'slide-16-9',
      page_count: 1,
    });
    const initial = body.initial_state as {
      pages: { id: string; configId: string; state: SlideLayoutState }[];
    };
    expect(initial.pages).toHaveLength(1);
    const [page] = initial.pages;
    expect(page).toMatchObject({ id: 'seed-0', configId: 'freeform' });
    const expected = buildSlideLayout('titel', {
      locale: 'de-DE',
      pageNumber: 1,
      date: new Date(),
    });
    expect(page!.state.layerOrder).toEqual(expected.layerOrder);
    expect(page!.state.additionalTexts.find((t) => t.id === 'folie-headline')?.text).toBe(
      'Titelfolie'
    );
  });

  it('uses the Austrian template and brand for de-AT', async () => {
    create.mockResolvedValue({ status: 201, body: { id: 'deck-2' } });
    await createSlideDeck('de-AT');
    const { body } = create.mock.calls[0]![0] as { body: Record<string, unknown> };
    expect(body).toMatchObject({ template_type: 'freeform-at', format: 'slide-16-9' });
    const initial = body.initial_state as {
      pages: { configId: string; state: SlideLayoutState }[];
    };
    expect(initial.pages[0]!.configId).toBe('freeform-at');
    expect(initial.pages[0]!.state.backgroundColor).toBe('#257639');
  });

  it('throws when the server refuses', async () => {
    create.mockResolvedValue({ status: 500, body: { error: 'x' } });
    await expect(createSlideDeck('de-DE')).rejects.toThrow('HTTP 500');
  });
});
