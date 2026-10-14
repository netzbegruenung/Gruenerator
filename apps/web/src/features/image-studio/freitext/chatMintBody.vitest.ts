import { deckSpec, readSharepicSource } from '@gruenerator/canvas-editor/composer';
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
    slides: [1, 2, 3].map((a) => ({ a, backgroundColor: '#005437' })),
  });
});

function sourcesOf(body: Awaited<ReturnType<typeof chatMintBody>>) {
  const pages = body.initialProps.pages as Array<{
    configId: string;
    state: Record<string, unknown>;
  }>;
  return pages.map((p) => readSharepicSource({ configId: p.configId, state: p.state })!);
}

describe('chatMintBody', () => {
  it('writes the creator base and tweak choice as the source, composing from the shown spec', async () => {
    const base = { locale: 'de-DE', slides: [slide] };
    const shown = { locale: 'de-DE', slides: [{ ...slide, position: 'oben' }] };
    composeCreatorSharepic.mockResolvedValueOnce({
      templateType: 'freeform',
      format: 'post-portrait-tall',
      slides: [{ a: 1, backgroundColor: '#005437' }],
    });
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: {
        creatorSpec: shown,
        creatorBase: base,
        creatorTweaks: { farbe: 'mint' },
        attributions: [null],
      },
    });
    expect(composeCreatorSharepic).toHaveBeenCalledWith(shown, [null]);
    const [source] = sourcesOf(body);
    expect(source!.slide).toEqual(base);
    expect(source!.tweaks).toEqual({ farbe: 'mint' });
  });

  it('falls back to the creator spec and no tweaks without base and choice', async () => {
    const withExtras = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    const [source] = sourcesOf(withExtras);
    expect(source!.slide.slides).toHaveLength(1);
    expect(deckSpec(withExtras.initialProps.pages as never, source!.deck)).toEqual(SPEC3);
    expect(source!.tweaks).toBeUndefined();
  });

  it('keeps the composed pages identical whether or not base and choice come along', async () => {
    const strip = (b: Awaited<ReturnType<typeof chatMintBody>>) =>
      (b.initialProps.pages as Array<{ state: Record<string, unknown> }>).map((p) => {
        const { sharepicSource: src, ...rest } = p.state as {
          sharepicSource: { baseline: unknown };
        };
        return { rest, baseline: src.baseline };
      });
    const plain = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    const withBase = await chatMintBody({
      canvasType: 'freeform',
      initialProps: {
        creatorSpec: SPEC3,
        creatorBase: SPEC3,
        creatorTweaks: { farbe: 'mint' },
        attributions: [null, null, null],
      },
    });
    expect(strip(withBase)).toEqual(strip(plain));
  });

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

  it('stores the creator spec as one deck of one-slide sources', async () => {
    const body = await chatMintBody({
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC3, attributions: [null, null, null] },
    });
    const pages = body.initialProps.pages as Array<{
      configId: string;
      state: Record<string, unknown>;
    }>;
    const sources = pages.map((p) => readSharepicSource({ configId: p.configId, state: p.state }));
    expect(sources.every((s) => s !== null)).toBe(true);
    expect(new Set(sources.map((s) => s!.deck)).size).toBe(1);
    expect(deckSpec(pages, sources[0]!.deck)).toEqual(SPEC3);
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
