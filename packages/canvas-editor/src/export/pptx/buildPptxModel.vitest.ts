import { describe, expect, it } from 'vitest';

import { composeSharepic } from '../../composer/composeSharepic';
import { at, deCarousel, options } from '../../composer/sharepicSpecFixtures';
import { getCanvasFormat, type CanvasFormat } from '../../formats';

import {
  buildPptxModel,
  PPTX_MAPPED_PAGE_KEYS,
  PPTX_UNMAPPED_PAGE_KEYS,
  type PptxPageState,
} from './buildPptxModel';

import type {
  PptxChartItem,
  PptxImageItem,
  PptxItem,
  PptxRasterRequest,
  PptxShapeItem,
  PptxTextItem,
} from './types';
import type { AdditionalText } from '../../configs/types';
import type { ChartInstance } from '../../utils/chartUtils';
import type { ShapeInstance } from '../../utils/shapes';
import type { UserImageInstance } from '../../utils/userImageUtils';

/** Das Folienformat (`slide-16-9`) entsteht parallel; hier inline mit denselben Maßen. */
const SLIDE: CanvasFormat = {
  id: 'slide-16-9',
  label: 'Präsentation',
  description: '1920 × 1080 · 16:9 · Folien',
  group: 'sharepic',
  category: 'digital',
  width: 1920,
  height: 1080,
  dpi: 72,
  iconKey: 'landscape',
  defaultExport: 'png',
  exportable: ['png'],
  print: null,
};

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

const slideOf = (state: PptxPageState) => buildPptxModel([state], SLIDE, { measure }).slides[0]!;
const itemsOf = (state: PptxPageState) => slideOf(state).items;
const byId = (items: PptxItem[], id: string) =>
  items.find((item) => (item.kind === 'raster' ? item.elementId : item.id) === id);

const text = (overrides: Partial<AdditionalText> = {}): AdditionalText => ({
  id: 'text-1',
  text: 'Hallo Welt',
  type: 'body',
  x: 100,
  y: 200,
  width: 800,
  fontSize: 40,
  fontFamily: 'PT Sans',
  fill: '#FFFFFF',
  ...overrides,
});

const shape = (overrides: Partial<ShapeInstance> = {}): ShapeInstance => ({
  id: 'shape-1',
  type: 'rect',
  x: 500,
  y: 400,
  width: 200,
  height: 100,
  fill: '#005538',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  ...overrides,
});

const userImage = (overrides: Partial<UserImageInstance> = {}): UserImageInstance => ({
  id: 'user-image-1',
  src: '/uploads/foto.jpg',
  fileName: 'foto.jpg',
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  rotation: 0,
  scale: 1,
  opacity: 1,
  ...overrides,
});

const chart = (overrides: Partial<ChartInstance> = {}): ChartInstance => ({
  id: 'chart-1',
  x: 1000,
  y: 300,
  width: 600,
  height: 400,
  scale: 1,
  rotation: 0,
  opacity: 1,
  chartType: 'bar',
  data: [
    { name: 'Wind', value: 40 },
    { name: 'Sonne', value: 25 },
  ],
  colors: ['#005538', '#8ABD24'],
  title: 'Strommix',
  unit: '%',
  showLegend: true,
  showGrid: false,
  showValues: true,
  ...overrides,
});

/** Jede Elementart des Freeform-Zustands einmal, auf der 16:9-Folie. */
const everyKind: PptxPageState = {
  isDesktop: true,
  backgroundMode: 'color',
  backgroundColor: '#005538',
  hasBackgroundImage: false,
  imageOffset: { x: 0, y: 0 },
  imageScale: 1,
  backgroundImageOpacity: 1,
  imageAttribution: null,
  stashedComposerPlanes: [],
  lockedLayerIds: [],
  additionalTexts: [
    text({
      id: 'text-head',
      type: 'header',
      text: 'Wir **packen** das ==an== und ++jetzt++',
      fontFamily: 'GrueneTypeNeue',
      fontSize: 96,
      align: 'center',
      accent: { fill: '#BEFF60', fontFamily: 'GrueneTypeNeue', fontStyle: 'italic' },
    }),
    text({ id: 'text-list', y: 500, text: '- Saubere Luft\n- Jobs vor Ort\n3. Drittens' }),
  ],
  shapeInstances: [
    shape({ id: 'shape-rect' }),
    shape({ id: 'shape-circle', type: 'circle', x: 1600, y: 200, width: 120, height: 120 }),
    shape({ id: 'shape-triangle', type: 'triangle', x: 1600, y: 500 }),
    shape({ id: 'shape-star', type: 'star', x: 1600, y: 800, width: 160, height: 160 }),
    shape({ id: 'shape-arrow', type: 'arrow', x: 300, y: 900 }),
  ],
  pillBadgeInstances: [
    {
      id: 'pill-1',
      text: 'Wusstest du?',
      x: 80,
      y: 60,
      backgroundColor: '#005538',
      textColor: '#FFFFFF',
      fontSize: 50,
      fontFamily: 'GrueneTypeNeue',
      fontStyle: 'normal',
      rotation: 0,
      scale: 1,
      opacity: 1,
      paddingX: 40,
      paddingY: 16,
      cornerRadius: 50,
    },
  ],
  circleBadgeInstances: [
    {
      id: 'circle-badge-1',
      x: 1700,
      y: 900,
      radius: 120,
      backgroundColor: '#FFF17A',
      textColor: '#005538',
      rotation: -8,
      scale: 1,
      textLines: [
        { text: 'SA', yOffset: -40, fontFamily: 'PT Sans', fontSize: 32, fontWeight: 'bold' },
        { text: '12.10.', yOffset: 10, fontFamily: 'PT Sans', fontSize: 48 },
      ],
    },
  ],
  chartInstances: [chart()],
  userImageInstances: [userImage(), userImage({ id: 'user-image-grau', x: 600, grayscale: true })],
  assetInstances: [
    { id: 'asset-1', assetId: 'sunflower', x: 1800, y: 100, scale: 1, rotation: 0, opacity: 1 },
  ],
  illustrationInstances: [
    {
      id: 'illustration-1',
      illustrationId: 'planet',
      source: 'kawaii',
      x: 300,
      y: 600,
      scale: 1,
      rotation: 0,
      color: '#8ABD24',
      opacity: 1,
      mood: 'happy',
    },
  ],
  frameInstances: [
    {
      id: 'frame-1',
      clipType: 'circle',
      x: 900,
      y: 800,
      width: 300,
      height: 300,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      imageSrc: null,
      imageOffsetX: 0,
      imageOffsetY: 0,
      imageScale: 1,
      borderColor: '#FFFFFF',
      borderWidth: 0,
      cornerRadius: 0,
    },
  ],
  balkenInstances: [
    {
      id: 'balken-1',
      mode: 'single',
      colorSchemeId: 'tanne-sand',
      widthScale: 1,
      offset: { x: 0, y: 0 },
      scale: 1,
      texts: ['Balken'],
      rotation: 0,
    },
  ],
  selectedIcons: ['pi-leaf'],
  iconStates: { 'pi-leaf': { x: 1200, y: 900, scale: 0.5, rotation: 0, color: '#FFFFFF' } },
  layerOrder: [],
  notes: 'Begrüßung, dann zu den drei Gründen.',
};

describe('buildPptxModel — fixtures', () => {
  it('maps composer carousels on their own format', () => {
    for (const spec of [deCarousel, at]) {
      const composed = composeSharepic(spec, options);
      const format = getCanvasFormat(composed.format)!;
      const model = buildPptxModel(composed.slides, format, { measure });
      expect(model.slides).toHaveLength(composed.slides.length);
      for (const slide of model.slides) expect(slide.unknownKeys).toEqual([]);
      // Foto- und Farbfolie genügen fürs Snapshot; der Rest ist dieselbe Abbildung.
      expect({ ...model, slides: model.slides.slice(0, 2) }).toMatchSnapshot(spec.locale);
    }
  });

  it('maps a 16:9 slide with every element kind', () => {
    const model = buildPptxModel([everyKind], SLIDE, { measure });
    expect(model.page).toEqual({ width: 1920, height: 1080 });
    expect(model.slides[0]!.unknownKeys).toEqual([]);
    expect(model).toMatchSnapshot();
  });

  it('lists every key of the freeform state as mapped or deliberately unmapped', () => {
    const known = new Set<string>([
      ...PPTX_MAPPED_PAGE_KEYS,
      ...Object.keys(PPTX_UNMAPPED_PAGE_KEYS),
    ]);
    expect(Object.keys(everyKind).filter((key) => !known.has(key))).toEqual([]);
  });
});

describe('buildPptxModel — background', () => {
  it('a colour background becomes the slide background', () => {
    const slide = slideOf({ backgroundMode: 'color', backgroundColor: '#8ABD24' });
    expect(slide.background).toEqual({ color: '#8ABD24' });
    expect(slide.items).toEqual([]);
  });

  it('a plain photo becomes a full-bleed cover image under everything', () => {
    const items = itemsOf({
      backgroundMode: 'image',
      hasBackgroundImage: true,
      currentImageSrc: '/foto.jpg',
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      shapeInstances: [shape()],
    });
    expect(items[0]).toEqual<PptxImageItem>({
      kind: 'image',
      id: 'background-image',
      box: { x: 0, y: 0, width: 1920, height: 1080 },
      rotation: 0,
      opacity: 1,
      src: '/foto.jpg',
      fit: 'cover',
      rounding: false,
    });
  });

  it('a moved, zoomed, faded or edited photo is rastered', () => {
    const photo = { backgroundMode: 'image', hasBackgroundImage: true, currentImageSrc: '/f.jpg' };
    for (const change of [
      { imageOffset: { x: 40, y: 0 } },
      { imageScale: 1.4 },
      { backgroundImageOpacity: 0.5 },
      { backgroundImageAdjustments: { grayscale: true } },
    ]) {
      expect(itemsOf({ ...photo, ...change })[0]).toMatchObject({
        kind: 'raster',
        elementId: 'background-image',
        reason: 'background-adjusted',
      });
    }
  });

  it('a hidden photo (colour mode) draws nothing', () => {
    const items = itemsOf({
      backgroundMode: 'color',
      hasBackgroundImage: true,
      currentImageSrc: '/f.jpg',
    });
    expect(items).toEqual([]);
  });
});

describe('buildPptxModel — text', () => {
  const textItem = (t: AdditionalText) => itemsOf({ additionalTexts: [t] })[0] as PptxTextItem;

  it('carries font, size, colour, alignment and line height', () => {
    const item = textItem(
      text({ fontStyle: 'bold', align: 'right', lineHeight: 1.1, opacity: 0.8 })
    );
    expect(item).toMatchObject({
      kind: 'text',
      fontFace: 'PT Sans',
      fontSize: 40,
      color: '#FFFFFF',
      bold: true,
      italic: false,
      align: 'right',
      lineHeight: 1.1,
      opacity: 0.8,
      box: { x: 100, y: 200, width: 800, height: 44 },
    });
  });

  it('turns markdown-lite into runs', () => {
    const [paragraph] = textItem(text({ text: '**fett** _kursiv_ <u>unter</u>' })).paragraphs;
    expect(paragraph!.runs.map((r) => [r.text, r.bold, r.italic, r.underline])).toEqual([
      ['fett', true, false, false],
      [' ', false, false, false],
      ['kursiv', false, true, false],
      [' ', false, false, false],
      ['unter', false, false, true],
    ]);
  });

  it('gives ==accent== runs the template accent, or their own colour', () => {
    const accent = { fill: '#BEFF60', fontFamily: 'Vollkorn', fontStyle: 'italic' as const };
    const runs = textItem(text({ text: 'a ==b==', accent })).paragraphs[0]!.runs;
    expect(runs[1]).toMatchObject({
      text: 'b',
      color: '#BEFF60',
      fontFace: 'Vollkorn',
      italic: true,
    });
    const plain = textItem(text({ text: 'a ==b==' })).paragraphs[0]!.runs;
    expect(plain[1]).toMatchObject({ text: 'b', color: '#FFFFFF', fontFace: null });
  });

  it('gives ++marker++ runs a highlight with readable ink', () => {
    const marker = { fill: '#77F6A5', color: '#00261A' };
    const runs = textItem(text({ text: 'a ++b++', marker })).paragraphs[0]!.runs;
    expect(runs[1]).toMatchObject({ text: 'b', highlight: '#77F6A5', color: '#00261A' });
    // Ohne Markerstil der Vorlage: der Standardkasten Limette.
    const fallback = textItem(text({ text: '++b++' })).paragraphs[0]!.runs;
    expect(fallback[0]).toMatchObject({ highlight: '#BEFF60', color: '#00261A' });
  });

  it('maps bullet and numbered lists per paragraph', () => {
    const item = textItem(text({ text: 'Intro\n- eins\n- zwei\n3. drei\n4. vier' }));
    expect(item.paragraphs.map((p) => p.bullet)).toEqual([
      null,
      { type: 'bullet' },
      { type: 'bullet' },
      { type: 'number', startAt: 3 },
      { type: 'number', startAt: 3 },
    ]);
  });

  it('wraps to estimate the box height', () => {
    const item = textItem(text({ width: 200, text: 'eins zwei drei vier' }));
    // 20 px je Zeichen: „eins zwei" (180 px) passt, „eins zwei drei" (280 px) nicht.
    expect(item.box.height).toBe(2 * 40 * 1.2);
  });

  it('scales font and box and turns about the box centre', () => {
    const item = textItem(text({ x: 0, y: 0, width: 100, scale: 2, rotation: 90, text: 'ab' }));
    expect(item.fontSize).toBe(80);
    expect(item.rotation).toBe(90);
    // Konva dreht um (0,0): die Mitte (100, 48) landet bei (-48, 100).
    expect(item.box.width).toBe(200);
    expect(item.box.x + item.box.width / 2).toBeCloseTo(-48);
    expect(item.box.y + item.box.height / 2).toBeCloseTo(100);
  });

  it('carries outline and shadow', () => {
    const item = textItem(
      text({ stroke: '#000000', strokeWidth: 3, shadowColor: '#000000', shadowBlur: 8 })
    );
    expect(item.outline).toEqual({ color: '#000000', width: 3 });
    expect(item.shadow).toEqual({ color: '#000000', blur: 8, offsetX: 0, offsetY: 0, opacity: 1 });
  });

  it('rasters gradient text', () => {
    const fillGradient = { type: 'linear' as const, angle: 0, stops: [] };
    expect(textItem(text({ fillGradient }))).toMatchObject({
      kind: 'raster',
      reason: 'text-gradient',
    });
  });
});

describe('buildPptxModel — shapes', () => {
  const shapeItem = (s: ShapeInstance) => itemsOf({ shapeInstances: [s] })[0]!;

  it('maps rect, circle, triangle and star natively', () => {
    expect(shapeItem(shape())).toMatchObject<Partial<PptxShapeItem>>({
      kind: 'shape',
      shape: 'rect',
      box: { x: 400, y: 350, width: 200, height: 100 },
      fill: '#005538',
    });
    expect(shapeItem(shape({ type: 'circle', width: 100 }))).toMatchObject({
      shape: 'ellipse',
      box: { x: 450, y: 350, width: 100, height: 100 },
    });
    const triangle = shapeItem(shape({ type: 'triangle', width: 200 })) as PptxShapeItem;
    expect(triangle.shape).toBe('triangle');
    expect(triangle.box.y).toBeCloseTo(300);
    expect(triangle.box.height).toBeCloseTo(150);
    expect(shapeItem(shape({ type: 'star' }))).toMatchObject({ shape: 'star5' });
  });

  it('scales the box and keeps the rotation about the centre', () => {
    const item = shapeItem(shape({ scaleX: 2, scaleY: 0.5, rotation: 30 })) as PptxShapeItem;
    expect(item.box).toEqual({ x: 300, y: 375, width: 400, height: 50 });
    expect(item.rotation).toBe(30);
  });

  it('rasters path shapes', () => {
    for (const type of ['arrow', 'double-arrow', 'arrow-curved', 'heart-arrow', 'line'] as const) {
      expect(shapeItem(shape({ type }))).toMatchObject({ kind: 'raster', reason: 'shape-path' });
    }
  });

  it('rasters gradient and blended shapes', () => {
    const fillGradient = { type: 'linear' as const, angle: 90, stops: [] };
    expect(shapeItem(shape({ fillGradient }))).toMatchObject({ reason: 'shape-styled' });
    expect(shapeItem(shape({ blendMode: 'color' }))).toMatchObject({ reason: 'shape-styled' });
  });
});

describe('buildPptxModel — images and charts', () => {
  const imageItem = (u: UserImageInstance) => itemsOf({ userImageInstances: [u] })[0]!;

  it('maps a plain user image with its fit and circle crop', () => {
    expect(imageItem(userImage())).toMatchObject<Partial<PptxImageItem>>({
      kind: 'image',
      src: '/uploads/foto.jpg',
      fit: 'stretch',
      rounding: false,
      box: { x: 100, y: 100, width: 400, height: 300 },
    });
    expect(imageItem(userImage({ fit: 'cover' }))).toMatchObject({ fit: 'cover' });
    expect(imageItem(userImage({ width: 300, mask: 'kreis' }))).toMatchObject({ rounding: true });
  });

  it('rasters filtered, shadowed, panned or oval images', () => {
    for (const change of [
      { brightness: 0.2 },
      { blur: 4 },
      { tint: '#005538' },
      { flipX: true },
      { shadowColor: '#000000' },
      { fit: 'cover' as const, panX: 0.5 },
      { mask: 'kreis' as const },
    ]) {
      expect(imageItem(userImage(change))).toMatchObject({
        kind: 'raster',
        reason: 'image-adjusted',
      });
    }
  });

  it('maps every chart type natively', () => {
    const types = (['bar', 'bar-horizontal', 'line', 'area', 'pie', 'donut'] as const).map(
      (chartType) => itemsOf({ chartInstances: [chart({ chartType })] })[0] as PptxChartItem
    );
    expect(types.map((c) => [c.chartType, c.barDir])).toEqual([
      ['bar', 'col'],
      ['bar', 'bar'],
      ['line', null],
      ['area', null],
      ['pie', null],
      ['doughnut', null],
    ]);
    expect(types[0]).toMatchObject({ labels: ['Wind', 'Sonne'], values: [40, 25], unit: '%' });
  });

  it('rasters a chart type it does not know', () => {
    const odd = chart({ chartType: 'radar' as ChartInstance['chartType'] });
    expect(itemsOf({ chartInstances: [odd] })[0]).toMatchObject({ reason: 'chart-unmapped' });
  });
});

describe('buildPptxModel — badges, motifs, order, notes', () => {
  it('splits a pill into a rounded rect and centred text', () => {
    const items = itemsOf({ pillBadgeInstances: everyKind.pillBadgeInstances });
    const [rect, label] = items as [PptxShapeItem, PptxTextItem];
    // „Wusstest du?" = 12 Zeichen × 25 px + 2 × 40 Innenabstand.
    expect(rect).toMatchObject({
      shape: 'roundRect',
      box: { x: 80, y: 60, width: 380, height: 82 },
    });
    expect(rect.rectRadius).toBe(41);
    expect(label).toMatchObject({ id: 'pill-1#text', align: 'center', valign: 'middle' });
    expect(label.box).toEqual(rect.box);
  });

  it('splits a circle badge into a circle and one text per line', () => {
    const items = itemsOf({ circleBadgeInstances: everyKind.circleBadgeInstances });
    expect(items.map((i) => i.kind)).toEqual(['shape', 'text', 'text']);
    expect(items[0]).toMatchObject({ shape: 'ellipse', rotation: -8 });
    expect(items[1]).toMatchObject({ bold: true, fontSize: 32 });
  });

  it('rasters icons, illustrations, assets, frames and balken with their element id', () => {
    const rasters = slideOf(everyKind).items.filter(
      (i): i is PptxRasterRequest => i.kind === 'raster'
    );
    expect(rasters.map((r) => [r.elementId, r.reason, r.boxExact])).toEqual([
      ['balken-1', 'balken', false],
      ['pi-leaf', 'icon', true],
      ['shape-arrow', 'shape-path', true],
      ['frame-1', 'frame', true],
      ['illustration-1', 'illustration', true],
      ['asset-1', 'asset', false],
      ['user-image-grau', 'image-adjusted', true],
    ]);
    expect(byId(rasters, 'pi-leaf')!.box).toEqual({ x: 1150, y: 850, width: 100, height: 100 });
  });

  it('draws in layerOrder first, then the rest in the default order', () => {
    const items = itemsOf({
      additionalTexts: [text()],
      shapeInstances: [shape({ id: 'a' }), shape({ id: 'b' })],
      layerOrder: ['text-1', 'b'],
    });
    expect(items.map((i) => (i.kind === 'raster' ? i.elementId : i.id))).toEqual([
      'text-1',
      'b',
      'a',
    ]);
  });

  it('carries the speaker notes', () => {
    expect(slideOf({ notes: 'Erst danken.' }).notes).toBe('Erst danken.');
    expect(slideOf({ notes: '  ' }).notes).toBeNull();
    expect(slideOf({}).notes).toBeNull();
  });
});

describe('buildPptxModel — unknown state never drops silently', () => {
  it('rasters an unknown collection of elements and reports its key', () => {
    const slide = slideOf({ stickerInstances: [{ id: 'sticker-1', x: 1 }] });
    expect(slide.unknownKeys).toEqual(['stickerInstances']);
    expect(slide.items).toEqual([
      expect.objectContaining({ kind: 'raster', elementId: 'sticker-1', reason: 'unknown' }),
    ]);
  });

  it('rasters a layerOrder id that no known collection holds, in its place', () => {
    const items = itemsOf({ shapeInstances: [shape()], layerOrder: ['neu-1', 'shape-1'] });
    expect(items[0]).toMatchObject({ kind: 'raster', elementId: 'neu-1', boxExact: false });
    expect(items[1]).toMatchObject({ kind: 'shape', id: 'shape-1' });
  });

  it('reports an unknown scalar key without inventing an element', () => {
    const slide = slideOf({ fancyMode: true });
    expect(slide.unknownKeys).toEqual(['fancyMode']);
    expect(slide.items).toEqual([]);
  });
});
