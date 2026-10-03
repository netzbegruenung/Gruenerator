import { beforeEach, describe, expect, it, vi } from 'vitest';

const { composeCreatorSharepic } = vi.hoisted(() => ({ composeCreatorSharepic: vi.fn() }));

vi.mock('./composeForRender', async () => {
  const actual = await vi.importActual<typeof import('./composeForRender')>('./composeForRender');
  return { ...actual, composeCreatorSharepic };
});

import { chatMintBody } from './chatMintBody';

const slide = {
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
  logo: false,
};
const SPEC3 = { locale: 'de-DE', slides: [slide, slide, slide] };

beforeEach(() => {
  composeCreatorSharepic.mockReset().mockResolvedValue({
    templateType: 'freeform',
    format: 'post-portrait-tall',
    slides: [{ a: 1 }, { a: 2 }, { a: 3 }],
  });
});

describe('chatMintBody', () => {
  it('composes creator props into seeded pages with the format', async () => {
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    expect(body.canvasType).toBe('freeform');
    expect(body.format).toBe('post-portrait-tall');
    expect((body.initialProps.pages as unknown[]).length).toBe(3);
    expect(body.initialProps).not.toHaveProperty('creatorSpec');
  });

  it('passes legacy template props through unchanged', async () => {
    const input = { canvasType: 'dreizeilen', initialProps: { line1: 'a' } } as const;
    expect(await chatMintBody(input)).toEqual(input);
  });
});
