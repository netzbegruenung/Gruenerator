import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderCreatorTurn } from './creatorRender';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  compose: vi.fn(),
  loadImage: vi.fn(),
}));
vi.mock('../renderSharepicToImage', () => ({ renderSharepicToImage: mocks.render }));
vi.mock('./composeForRender', () => ({ composeCreatorSharepic: mocks.compose }));
vi.mock('./photoTone', () => ({ loadImage: mocks.loadImage }));

const base: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'oben',
      align: 'links',
      items: [{ type: 'headline', lines: ['Mehr Radwege'] }],
      logo: false,
    },
  ],
};

const composedOf = (spec: SharepicSpec) => ({
  templateType: 'freeform',
  format: 'post-portrait',
  slides: spec.slides.map(() => ({})),
});

beforeEach(() => {
  mocks.render.mockReset();
  mocks.render.mockResolvedValue('data:image/png;base64,AAA');
  mocks.compose.mockReset();
  mocks.compose.mockImplementation((spec: SharepicSpec) => Promise.resolve(composedOf(spec)));
});

describe('renderCreatorTurn', () => {
  it('applies the review patch to the draft before the design choices', async () => {
    const result = await renderCreatorTurn({
      base,
      patch: [{ op: 'set_headline', item: 0, lines: ['Sichere Radwege'] }],
      choice: { farbe: 'mint' },
      attributions: [null],
      sheet: false,
    });
    expect(result).not.toBeNull();
    const headline = (spec: SharepicSpec) => spec.slides[0]!.items[0];
    expect(headline(result!.base)).toMatchObject({ lines: ['Sichere Radwege'] });
    expect(result!.base.slides[0]!.background).toEqual({ kind: 'farbe', color: 'tanne' });
    expect(headline(result!.spec)).toMatchObject({ lines: ['Sichere Radwege'] });
    expect(result!.spec.slides[0]!.background).toEqual({ kind: 'farbe', color: 'mint' });
    expect(mocks.compose).toHaveBeenCalledWith(result!.spec, [null]);
  });

  it('keeps the draft when there is no patch', async () => {
    const result = await renderCreatorTurn({
      base,
      patch: null,
      choice: {},
      attributions: [null],
      sheet: false,
    });
    expect(result!.base).toBe(base);
    expect(result!.spec).toEqual(base);
  });

  it('is null when a slide fails to render', async () => {
    mocks.render.mockResolvedValue(null);
    const result = await renderCreatorTurn({
      base,
      patch: null,
      choice: {},
      attributions: [null],
      sheet: true,
    });
    expect(result).toBeNull();
  });

  it('builds the sheet only when asked', async () => {
    const turn = (sheet: boolean) =>
      renderCreatorTurn({ base, patch: null, choice: {}, attributions: [null], sheet });
    expect((await turn(false))!.sheet).toBeNull();
    // One slide: the sheet is the slide itself.
    expect((await turn(true))!.sheet).toBe('data:image/png;base64,AAA');
    expect((await turn(true))!.images).toEqual(['data:image/png;base64,AAA']);
  });

  it('skips the sheet instead of failing the turn when it cannot be built', async () => {
    mocks.loadImage.mockRejectedValue(new Error('decode failed'));
    const twoSlides: SharepicSpec = { ...base, slides: [base.slides[0]!, base.slides[0]!] };
    const result = await renderCreatorTurn({
      base: twoSlides,
      patch: null,
      choice: {},
      attributions: [null, null],
      sheet: true,
    });
    expect(result!.sheet).toBeNull();
    expect(result!.images).toHaveLength(2);
  });

  it('reports the variations of the patched draft with the choice shown', async () => {
    const result = await renderCreatorTurn({
      base,
      patch: null,
      choice: { farbe: 'mint' },
      attributions: [null],
      sheet: false,
    });
    const farbe = result!.tweaks.find((t) => t.id === 'farbe');
    expect(farbe?.value).toBe('mint');
    expect(farbe?.options.map((o) => o.value)).toContain('tanne');
  });
});
