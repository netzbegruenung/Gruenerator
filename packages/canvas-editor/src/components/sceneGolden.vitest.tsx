import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { composeSharepic } from '../composer/composeSharepic';
import { MORE_SPECS, SPECS } from '../composer/sharepicSpecFixtures';
import { loadAllIcons } from '../utils/canvasIcons';

import { StandaloneCanvas } from './StandaloneCanvas';

import type { CanvasConfigId } from '../configs/types';

/**
 * What the editor draws for every composer fixture, as a Konva scene graph:
 * each node's class, its plain attributes and its children. Moving rendering
 * onto the element-kind registry must leave these files unchanged; the
 * composer golden only proves the page object, this proves the canvas made
 * from it. Images load asynchronously in the browser and are not part of the
 * scene here, so an image's own attributes need the pixel lane.
 */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (file: string) => `/media/${file}`, measure };

const plain = (value: unknown): boolean =>
  value === null ||
  ['string', 'number', 'boolean'].includes(typeof value) ||
  (Array.isArray(value) && value.every(plain));

interface SceneNode {
  className: string;
  attrs: Record<string, unknown>;
  children?: SceneNode[];
}

function dump(node: Konva.Node): SceneNode {
  const attrs = Object.fromEntries(Object.entries(node.getAttrs()).filter(([, v]) => plain(v)));
  if (!(node instanceof Konva.Container)) return { className: node.getClassName(), attrs };
  return {
    className: node.getClassName(),
    attrs,
    children: (node.getChildren() as Konva.Node[]).map(dump),
  };
}

let measureContext: { measureText: unknown } | null = null;
let realMeasureText: unknown = null;

beforeAll(async () => {
  // Icon sets load on demand and the editor redraws once they are in; how
  // long that import takes decides whether an icon is in the scene. Load
  // them up front so every case sees the same catalogue. Charts draw through
  // a lazy recharts import for the same reason: a cold import outlasts the
  // settle wait and the chart is recorded as its placeholder.
  await loadAllIcons();
  await import('recharts');
  // Text is measured with whatever fonts the machine has, so widths differ
  // between macOS and the Linux CI runner. Measure with a fixed advance of
  // 0.55 em per character instead: the layout built on the widths is pinned,
  // the platform's fonts are not.
  const { createCanvas } = await import('@napi-rs/canvas');
  const context = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
    measureText(this: { font: string }, text: string): unknown;
    font: string;
  };
  realMeasureText = context.measureText;
  context.measureText = function measureText(this: { font: string }, text: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    const width = [...text].length * size * 0.55;
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.9,
      fontBoundingBoxDescent: size * 0.25,
      emHeightAscent: size * 0.8,
      emHeightDescent: size * 0.2,
      alphabeticBaseline: 0,
      hangingBaseline: size * 0.8,
      ideographicBaseline: -size * 0.2,
    };
  };
  measureContext = context;
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
});

afterAll(() => {
  if (measureContext) measureContext.measureText = realMeasureText;
});

afterEach(() => {
  cleanup();
  for (const stage of [...Konva.stages]) stage.destroy();
});

const STILL_MS = 500;

async function sceneOf(
  configId: string,
  formatId: string,
  slide: Record<string, unknown>
): Promise<SceneNode> {
  render(
    <StandaloneCanvas
      configId={configId as CanvasConfigId}
      formatId={formatId}
      initialProps={slide}
      preview
    />
  );
  // The canvas settles in steps (the config loads, the format sizes the
  // stage, async elements mount): take the scene once it holds still for
  // STILL_MS. Measured in time, not samples: waitFor also runs on every DOM
  // mutation, so three samples in a row spanned as little as 129 ms.
  let last = '';
  let stillSince = 0;
  await waitFor(
    () => {
      const stage = Konva.stages[0];
      const now = stage ? JSON.stringify(dump(stage)) : '';
      if (now === '' || now !== last) stillSince = performance.now();
      last = now;
      if (performance.now() - stillSince < STILL_MS) throw new Error('still settling');
    },
    { timeout: 10_000, interval: 100 }
  );
  const scene = JSON.parse(last) as SceneNode;
  cleanup();
  for (const stage of [...Konva.stages]) stage.destroy();
  return scene;
}

describe('editor scene golden', () => {
  for (const [name, spec] of Object.entries({ ...SPECS, ...MORE_SPECS })) {
    it(`${name} as ${spec.locale}`, async () => {
      const page = composeSharepic(spec, options);
      const scenes: SceneNode[] = [];
      for (const slide of page.slides) {
        scenes.push(
          await sceneOf(page.templateType, page.format, slide as unknown as Record<string, unknown>)
        );
      }
      await expect(`${JSON.stringify(scenes, null, 1)}\n`).toMatchFileSnapshot(
        `__golden__/scene/${name}.json`
      );
    }, 60_000);
  }
});
