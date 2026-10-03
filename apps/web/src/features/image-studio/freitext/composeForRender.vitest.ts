import { type SharepicSpec } from '@gruenerator/contracts';
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
