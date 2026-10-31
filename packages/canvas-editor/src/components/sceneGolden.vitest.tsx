import { DEFAULT_FORMAT_ID } from '@ggraphic/editor/formats/index';
import { loadAllIcons } from '@ggraphic/editor/utils/canvasIcons';
import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { composeSharepic } from '../composer/composeSharepic';
import { MORE_SPECS, SPECS } from '../composer/sharepicSpecFixtures';

import { StandaloneCanvas } from '@ggraphic/editor/components/StandaloneCanvas';

import type { CanvasConfigId } from '../templates/registry';

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

/**
 * The composer never emits Balken, frames or illustrations, so one slide
 * carries a hand-written instance of every element kind: rendering moves
 * kind by kind onto a table, and each kind needs a scene that turns red
 * when its renderer passes a prop differently.
 */
const EVERY_KIND: Record<string, unknown> = {
  backgroundColor: '#005538',
  balkenInstances: [
    {
      id: 'k-balken',
      mode: 'triple',
      colorSchemeId: 'tanne-sand',
      widthScale: 1,
      offset: { x: 40, y: 600 },
      scale: 1,
      texts: ['Eins', 'Zwei', 'Drei'],
      rotation: 3,
      opacity: 0.9,
    },
  ],
  selectedIcons: ['k-icon'],
  iconStates: {
    'k-icon': {
      iconId: 'tabler:arrow-narrow-right',
      x: 900,
      y: 200,
      scale: 0.5,
      rotation: 10,
      color: '#FFFFFF',
      opacity: 0.8,
    },
  },
  shapeInstances: [
    {
      id: 'k-shape',
      type: 'rounded-rect',
      x: 200,
      y: 200,
      width: 160,
      height: 90,
      fill: '#E6007E',
      rotation: 5,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.7,
      cornerRadius: 12,
    },
  ],
  frameInstances: [
    {
      id: 'k-frame',
      clipType: 'circle',
      x: 540,
      y: 300,
      width: 240,
      height: 240,
      rotation: 4,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.95,
      imageSrc: null,
      imageOffsetX: 0,
      imageOffsetY: 0,
      imageScale: 1,
      borderColor: '#FFFFFF',
      borderWidth: 6,
      cornerRadius: 0,
    },
  ],
  additionalTexts: [
    {
      id: 'k-text',
      text: 'Mehr Text',
      type: 'body',
      x: 70,
      y: 1000,
      width: 900,
      fontSize: 60,
      fontFamily: 'GothamNarrow-Ultra',
      fontStyle: 'normal',
      fill: '#FFFFFF',
      align: 'left',
      rotation: 2,
      opacity: 0.9,
    },
  ],
  illustrationInstances: [
    {
      id: 'k-illustration',
      illustrationId: 'planet',
      source: 'kawaii',
      x: 300,
      y: 500,
      scale: 1,
      rotation: 6,
      color: '#FCEC00',
      opacity: 0.85,
      mood: 'happy',
    },
  ],
  assetInstances: [
    {
      id: 'k-asset',
      assetId: 'brush-arrow-weiss',
      x: 800,
      y: 1100,
      scale: 1.5,
      rotation: 7,
      opacity: 0.75,
    },
  ],
  circleBadgeInstances: [
    {
      id: 'k-circle',
      x: 900,
      y: 500,
      radius: 110,
      backgroundColor: '#E4007C',
      textColor: '#FFFFFF',
      rotation: -8,
      scale: 1,
      opacity: 0.9,
      textLines: [
        {
          text: 'Neu',
          yOffset: -20,
          fontFamily: 'GothamNarrow-Ultra',
          fontSize: 38,
          fontWeight: 'bold',
        },
      ],
    },
  ],
  pillBadgeInstances: [
    {
      id: 'k-pill',
      text: 'gruene.de',
      x: 400,
      y: 800,
      backgroundColor: '#BEFF60',
      textColor: '#00261A',
      fontSize: 46,
      fontFamily: 'GrueneTypeNeue',
      fontStyle: 'normal',
      rotation: 3,
      scale: 1,
      opacity: 0.9,
      paddingX: 36,
      paddingY: 18,
      cornerRadius: 60,
    },
  ],
  userImageInstances: [
    {
      id: 'k-user-image',
      src: '/media/wind.jpg',
      fileName: 'wind.jpg',
      x: 0,
      y: 1150,
      width: 500,
      height: 200,
      rotation: 2,
      scale: 1,
      opacity: 0.9,
    },
  ],
  chartInstances: [
    {
      id: 'k-chart',
      x: 110,
      y: 300,
      width: 430,
      height: 236.5,
      scale: 1,
      rotation: 3,
      opacity: 0.9,
      chartType: 'bar',
      data: [
        { name: 'Wind', value: 40 },
        { name: 'Rest', value: 60 },
      ],
      colors: ['#257639', '#C8C8C7'],
      title: '',
      showLegend: true,
      showGrid: false,
      showValues: true,
      unit: '%',
      background: '#FFFFFF',
    },
  ],
};

describe('editor scene golden, every element kind', () => {
  // Icons, assets, illustrations and user images draw nothing until their
  // image loads, and jsdom never loads one. Here every image loads as a 4×4
  // bitmap from @napi-rs/canvas (the context vitest.setup.ts hands Konva),
  // so these kinds reach the scene. Only in this block: the composer files
  // above stay as they were recorded.
  const realImage = window.Image;
  beforeAll(async () => {
    const { Image, createCanvas } = await import('@napi-rs/canvas');
    const png = createCanvas(4, 4).toBuffer('image/png');
    const setSrc = Object.getOwnPropertyDescriptor(Image.prototype, 'src')?.set;
    function LoadedImage() {
      const image = new Image();
      // Whatever URL the primitive asks for, the bitmap arrives.
      Object.defineProperty(image, 'src', {
        get: () => 'loaded',
        set: () => setSrc?.call(image, png),
      });
      return image;
    }
    window.Image = LoadedImage as unknown as typeof window.Image;
    // Konva caches filtered images on a jsdom canvas the napi context rejects.
    vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();
  });
  afterAll(() => {
    window.Image = realImage;
    vi.restoreAllMocks();
  });

  it('freeform', async () => {
    const scene = await sceneOf('freeform', DEFAULT_FORMAT_ID, EVERY_KIND);
    await expect(`${JSON.stringify([scene], null, 1)}\n`).toMatchFileSnapshot(
      '__golden__/scene/everyKind.json'
    );
  }, 60_000);
});
