import { deckSpec, fingerprint, readSharepicSource } from '@gruenerator/canvas-editor/composer';
import { SHAREPIC_SOURCE_KEY, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gruenerator/canvas-editor/composer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gruenerator/canvas-editor/composer')>();
  return { ...actual, ensureFontsReady: vi.fn(async () => {}) };
});
vi.mock('./photoTone', () => ({
  primePhotoTones: vi.fn(async () => {}),
  cachedPhotoTone: vi.fn(() => null),
}));

import { canvasSeed, composeCreatorSharepic } from './composeForRender';

const slide = (headline: string): SharepicSpec['slides'][number] => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: [headline] }],
  logo: false,
});

const SPEC_3_SLIDES_TALL: SharepicSpec = {
  locale: 'de-DE',
  format: 'post-portrait-tall',
  slides: [slide('Eins'), slide('Zwei'), slide('Drei')],
};

describe('composeCreatorSharepic', () => {
  it('composes every slide and keeps the spec format', async () => {
    const composed = await composeCreatorSharepic(SPEC_3_SLIDES_TALL, [null, null, null]);
    expect(composed.slides).toHaveLength(3);
    expect(composed.format).toBe('post-portrait-tall');
  });
});

describe('canvasSeed', () => {
  it('seeds one page per slide with the format', async () => {
    const composed = await composeCreatorSharepic(SPEC_3_SLIDES_TALL, [null, null, null]);
    const seed = canvasSeed(composed);
    expect(seed.pageCount).toBe(3);
    expect(seed.format).toBe('post-portrait-tall');
    const pages = seed.initialState.pages as Array<{ id: string; configId: string }>;
    expect(pages.map((p) => p.id)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(pages.every((p) => p.configId === composed.templateType)).toBe(true);
  });
});

describe('canvasSeed sharepicSource', () => {
  it('writes a one-slide base source per page, one deck, baseline of the composed page', async () => {
    const composed = await composeCreatorSharepic(SPEC_3_SLIDES_TALL, [null, null, null]);
    const seed = canvasSeed(composed, {
      base: SPEC_3_SLIDES_TALL,
      tweaks: { farbe: 'sand' },
      attributions: [null, null, null],
    });
    const pages = seed.initialState.pages as Array<{
      configId: string;
      state: Record<string, unknown>;
    }>;
    const sources = pages.map((p) => readSharepicSource({ configId: p.configId, state: p.state }));
    expect(sources.every((s) => s !== null)).toBe(true);
    expect(new Set(sources.map((s) => s!.deck)).size).toBe(1);
    expect(sources[1]!.slide.slides).toEqual([SPEC_3_SLIDES_TALL.slides[1]]);
    expect(sources[1]!.tweaks).toEqual({ farbe: 'sand' });
    expect(sources[1]!.baseline).toEqual(fingerprint(composed.slides[1]!));
    expect(deckSpec(pages, sources[0]!.deck)).toEqual(SPEC_3_SLIDES_TALL);
    expect(pages[0]!.state[SHAREPIC_SOURCE_KEY]).toBeDefined();
  });

  it('writes no source without a mint source', async () => {
    const composed = await composeCreatorSharepic(SPEC_3_SLIDES_TALL, [null, null, null]);
    const pages = canvasSeed(composed).initialState.pages as Array<{ state: object }>;
    expect(pages[0]!.state).not.toHaveProperty(SHAREPIC_SOURCE_KEY);
  });
});

describe('canvasSeed slide-count mismatch', () => {
  it('writes no source and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const composed = await composeCreatorSharepic(SPEC_3_SLIDES_TALL, [null, null, null]);
    const base = { ...SPEC_3_SLIDES_TALL, slides: SPEC_3_SLIDES_TALL.slides.slice(0, 2) };
    const pages = canvasSeed(composed, { base, tweaks: {}, attributions: [] }).initialState
      .pages as Array<{ state: object }>;
    expect(pages[0]!.state).not.toHaveProperty(SHAREPIC_SOURCE_KEY);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
