import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configs/configLoader';
import { ConfigCanvas, StandaloneCanvas, type AnyCanvasConfig } from '../index';

/**
 * A host hands the canvas a template object and no format. The stage must take
 * the template's own size, not stretch it onto the default 4:5 format.
 */

let simple: AnyCanvasConfig;

beforeAll(async () => {
  simple = await loadCanvasConfig('simple');
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

const PROPS = { headline: 'Eigene Vorlage', subtext: 'ohne Format' };

/** The group that scales the template's space onto the stage, once text is drawn. */
async function sheetScale(): Promise<{ x: number; y: number }> {
  let scale = { x: 0, y: 0 };
  await waitFor(
    () => {
      const stage = Konva.stages[0];
      expect(stage?.find('Text').map((n) => (n as Konva.Text).text())).toContain(PROPS.headline);
      const sheet = stage?.find('Group').find((g) => g.scaleX() !== 1 || g.scaleY() !== 1);
      scale = sheet ? { x: sheet.scaleX(), y: sheet.scaleY() } : { x: 1, y: 1 };
    },
    { timeout: 10_000 }
  );
  return scale;
}

const square = (): AnyCanvasConfig => ({
  ...simple,
  id: 'square-host',
  canvas: { width: 1080, height: 1080 },
});

describe('ConfigCanvas', () => {
  it('draws a template object without any registration', async () => {
    render(
      <ConfigCanvas config={{ ...simple, id: 'unregistered' }} initialProps={PROPS} preview />
    );
    await sheetScale();
  });

  it('keeps a square template square when no format is given', async () => {
    render(<ConfigCanvas config={square()} initialProps={PROPS} preview />);
    const { x, y } = await sheetScale();
    expect(x).toBeCloseTo(y, 6);
  });

  it('keeps it square through StandaloneCanvas too', async () => {
    render(<StandaloneCanvas config={square()} initialProps={PROPS} preview />);
    const { x, y } = await sheetScale();
    expect(x).toBeCloseTo(y, 6);
  });

  it('lets an explicit format win over the template size', async () => {
    render(
      <ConfigCanvas config={square()} formatId="post-portrait" initialProps={PROPS} preview />
    );
    const { x, y } = await sheetScale();
    expect(y / x).toBeCloseTo(1350 / 1080, 6);
  });
});
