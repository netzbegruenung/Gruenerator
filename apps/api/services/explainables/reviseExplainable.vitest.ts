import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExplainableContent } from '@gruenerator/contracts';

const mocks = vi.hoisted(() => ({
  aiObject: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  getOwnExplainable: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  updateExplainableContent: vi.fn<(...a: unknown[]) => Promise<boolean>>(),
}));
vi.mock('../ai/generate.js', () => ({ aiObject: mocks.aiObject }));
vi.mock('./explainableRepository.js', () => ({
  getOwnExplainable: mocks.getOwnExplainable,
  updateExplainableContent: mocks.updateExplainableContent,
  insertExplainable: vi.fn(),
}));

const { carryImages, removedHeadings, reviseExplainable } = await import('./reviseExplainable.js');

const image = { prompt: 'p', alt: 'a', status: 'done' as const };
const previous: ExplainableContent = {
  title: 'Klimageld',
  summary: 'Kurz.',
  sections: [
    { heading: 'Was ist das?', paragraphs: ['A'], image },
    { heading: 'Wer bekommt es?', paragraphs: ['B'] },
  ],
  keyTakeaways: ['X', 'Y'],
  sources: [],
};

const draft = (headings: string[]) => ({
  title: 'Klimageld',
  summary: 'Kurz und neu.',
  sections: headings.map((heading) => ({
    heading,
    paragraphs: ['Neu'],
    image: { prompt: 'q', alt: 'b' },
  })),
  keyTakeaways: ['X', 'Y'],
});

const run = (removalAllowed = false) =>
  reviseExplainable({
    userId: 'u1',
    explainableId: 'e1',
    instruction: 'kürzer',
    locale: 'de-DE',
    removalAllowed,
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getOwnExplainable.mockResolvedValue({ id: 'e1', status: 'ready', content: previous });
  mocks.updateExplainableContent.mockResolvedValue(true);
});

describe('carryImages', () => {
  it('keeps a picture only where the section stayed put, never paints a new one', () => {
    const next = {
      ...previous,
      sections: [
        {
          heading: 'Was ist das?',
          paragraphs: ['A2'],
          image: { ...image, status: 'pending' as const },
        },
        { heading: 'Neu', paragraphs: ['C'], image: { ...image, status: 'pending' as const } },
      ],
    };
    const out = carryImages(next, previous);
    expect(out.sections[0].image).toEqual(image);
    expect(out.sections[1].image).toBeUndefined();
  });

  it('lists dropped sections', () => {
    expect(removedHeadings({ ...previous, sections: [previous.sections[0]] }, previous)).toEqual([
      'Wer bekommt es?',
    ]);
  });
});

describe('reviseExplainable', () => {
  it('saves the revised text and keeps the picture', async () => {
    mocks.aiObject.mockResolvedValue({
      ok: true,
      data: draft(['Was ist das?', 'Wer bekommt es?']),
    });
    expect(await run()).toMatchObject({ status: 'revised', keptImages: 1 });
    const saved = mocks.updateExplainableContent.mock.calls[0][2] as ExplainableContent;
    expect(saved.sections[0].image).toEqual(image);
    expect(saved.sections[1].image).toBeUndefined();
  });

  it('asks before dropping a section', async () => {
    mocks.aiObject.mockResolvedValue({ ok: true, data: draft(['Was ist das?', 'Fazit']) });
    expect(await run(false)).toMatchObject({
      status: 'needs_confirmation',
      removedHeadings: ['Wer bekommt es?'],
    });
    expect(mocks.updateExplainableContent).not.toHaveBeenCalled();
    expect((await run(true)).status).toBe('revised');
  });

  it('refuses while pictures are still being painted', async () => {
    mocks.getOwnExplainable.mockResolvedValue({
      id: 'e1',
      status: 'images_pending',
      content: previous,
    });
    expect((await run()).status).toBe('failed');
    expect(mocks.aiObject).not.toHaveBeenCalled();
  });

  it('reports a failed generation and a failed save honestly', async () => {
    mocks.aiObject.mockResolvedValue({ ok: false, error: 'x' });
    expect((await run()).status).toBe('failed');
    mocks.aiObject.mockResolvedValue({
      ok: true,
      data: draft(['Was ist das?', 'Wer bekommt es?']),
    });
    mocks.updateExplainableContent.mockResolvedValue(false);
    expect((await run()).status).toBe('failed');
  });
});
