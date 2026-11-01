/**
 * A text without a marker style of its own draws the default marker of the
 * brand of its DOCUMENT. The registry's first pack is German in the host, so an
 * Austrian canvas drew Limette boxes where the toolbar swatch showed yellow.
 * The brand reaches the Konva tree through `GenericCanvas`, which every mount
 * of a page shares (the editor shell, an embedded canvas, the offscreen
 * preview and export roots).
 */
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE } from '../brand/theme';

import { ConfigCanvas, StandaloneCanvas, type AnyCanvasConfig } from './../index';

const AT_BOX = GRUENE_AT.markers.swatches[0]!.color;
const DE_BOX = GRUENE_DE.markers.swatches[0]!.color;

let simple: AnyCanvasConfig;
let infoAt: AnyCanvasConfig;

beforeAll(async () => {
  [simple, infoAt] = await Promise.all([loadCanvasConfig('simple'), loadCanvasConfig('info-at')]);
  // jsdom has no FontFaceSet; the editor waits on it before it draws text.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: () => true,
      load: async () => [],
      ready: Promise.resolve(),
      status: 'loaded',
      addEventListener() {},
      removeEventListener() {},
    },
  });
}, 120_000);

afterEach(() => {
  cleanup();
  for (const stage of [...Konva.stages]) stage.destroy();
});

/** The box colours of the marker runs the page paints. */
async function markerBoxes(): Promise<string[]> {
  let fills: string[] = [];
  await waitFor(
    () => {
      const stage = Konva.stages[0];
      const texts = stage?.find('Text').map((node) => (node as Konva.Text).text().trim()) ?? [];
      expect(texts).toContain('frei');
      fills = stage!
        .find('Rect')
        .map((rect) => (rect as Konva.Rect).fill())
        .filter((fill): fill is string => typeof fill === 'string');
    },
    { timeout: 10_000 }
  );
  return fills;
}

const PROPS = { headline: 'Ich will ++frei++ sein', text: 'Ich will ++frei++ sein' };

describe('the default marker of a page', () => {
  it('is the Austrian one on an Austrian template', async () => {
    render(<ConfigCanvas config={infoAt} initialProps={PROPS} preview />);
    const fills = await markerBoxes();
    expect(fills).toContain(AT_BOX);
    expect(fills).not.toContain(DE_BOX);
  });

  it('is the Austrian one through StandaloneCanvas, the offscreen root of previews', async () => {
    render(<StandaloneCanvas config={infoAt} initialProps={PROPS} preview />);
    expect(await markerBoxes()).toContain(AT_BOX);
  });

  it('is the German one on a template that names no brand', async () => {
    render(<ConfigCanvas config={simple} initialProps={PROPS} preview />);
    const fills = await markerBoxes();
    expect(fills).toContain(DE_BOX);
    expect(fills).not.toContain(AT_BOX);
  });
});
