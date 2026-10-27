import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

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

beforeAll(async () => {
  // Icon sets load on demand and the editor redraws once they are in; how
  // long that import takes decides whether an icon is in the scene. Load
  // them up front so every case sees the same catalogue.
  await loadAllIcons();
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
