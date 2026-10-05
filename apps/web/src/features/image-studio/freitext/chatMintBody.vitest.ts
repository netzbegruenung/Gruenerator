import { canvasFromVariantBodySchema } from '@gruenerator/contracts';
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

  it('mints a body the closed fromVariant format accepts', async () => {
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    const wire = { ...body, threadId: 't1', variantId: 'v1' };
    expect(canvasFromVariantBodySchema.safeParse(wire).success).toBe(true);
    expect(canvasFromVariantBodySchema.safeParse({ ...wire, format: 'square' }).success).toBe(
      false
    );
  });

  it('titles a creator sharepic with its first headline, marks stripped', async () => {
    const spec = {
      locale: 'de-DE',
      slides: [
        {
          ...slide,
          items: [
            { type: 'dachzeile', text: 'Kita' },
            { type: 'headline', lines: ['Mehr ==Kita-Plätze==', 'für ++alle++'] },
          ],
        },
      ],
    };
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: spec, attributions: [null] },
    });
    expect(body.title).toBe('Mehr Kita-Plätze für alle');
  });

  it('falls back to the first text item and caps the title at 60 chars', async () => {
    const long =
      'Wir bauen Radwege, damit Kinder sicher zur Schule kommen und Eltern ruhig schlafen';
    const spec = {
      locale: 'de-DE',
      slides: [{ ...slide, items: [{ type: 'absatz', text: `==${long}==` }] }],
    };
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: spec, attributions: [null] },
    });
    expect(body.title).toBe(`${long.slice(0, 57)}…`);
    expect(body.title).toHaveLength(58);
  });

  it('sends a title the fromVariant contract accepts', async () => {
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    expect(body.title).toBe('Busse statt Stau');
    const wire = { ...body, threadId: 't1', variantId: 'v1' };
    expect(canvasFromVariantBodySchema.safeParse(wire).success).toBe(true);
    expect(canvasFromVariantBodySchema.safeParse({ ...wire, title: ' ' }).success).toBe(false);
  });

  it('gives a legacy template no title, so the server derives it', async () => {
    const body = await chatMintBody({ canvasType: 'dreizeilen', initialProps: { line1: 'a' } });
    expect(body).not.toHaveProperty('title');
  });

  it('falls back to a text item when the headline is empty', async () => {
    const spec = {
      locale: 'de-DE',
      slides: [
        {
          ...slide,
          items: [
            { type: 'headline', lines: ['===='] },
            { type: 'text', text: 'Busse statt Stau' },
          ],
        },
      ],
    };
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: spec, attributions: [null] },
    });
    expect(body.title).toBe('Busse statt Stau');
  });
});
