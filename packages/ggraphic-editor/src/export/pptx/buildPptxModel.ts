// SPDX-License-Identifier: MPL-2.0
/**
 * Seitenzustand einer Präsentation → PPTX-Modell (`types.ts`). Rein: kein
 * pptxgenjs, kein Konva, kein React. Was nativ in PowerPoint geht (Farbe,
 * Text, einfache Formen, Bilder ohne Bearbeitung, Diagramme), wird nativ;
 * alles andere wird eine Raster-Anfrage, die der Writer vom Stage holt — nie
 * still weggelassen.
 *
 * Gezeichnet wird wie `buildCanvasItems` + `buildSortedRenderList`: erst die
 * Ids in `layerOrder`, dann der Rest in der Standardreihenfolge der Arten.
 */

import { carryInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';
import { ASSET_TARGET_SIZE } from '@ggraphic/editor/utils/canvasAssets';
import { fromHostKinds, hostElementKinds, kindList } from '@ggraphic/editor/utils/elementKinds';
import {
  chartInk,
  chartLegendPosition,
  chartSeries,
  isRoundChartType,
  type ChartInstance,
  type ChartType,
} from '@ggraphic/editor/utils/chartUtils';
import { ICON_TARGET_SIZE, ILLUSTRATION_TARGET_SIZE } from '@ggraphic/editor/utils/motifSizes';
import { photoStripBeside, type ShapeInstance } from '@ggraphic/editor/utils/shapes';
import { backgroundStraighten } from '@ggraphic/editor/utils/straighten';

import {
  estimateMeasure,
  textParagraphs,
  wrappedLineCount,
  type PptxMeasureText,
} from './textModel.js';

import type {
  PptxBox,
  PptxChartItem,
  PptxDeckModel,
  PptxItem,
  PptxRasterReason,
  PptxRasterRequest,
  PptxShadow,
  PptxShapeKind,
  PptxSlideModel,
} from './types.js';
import type { AdditionalText } from '@ggraphic/editor/configs/types';
import type { CanvasFormat } from '@ggraphic/editor/formats/index';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ImageAdjustments, UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

/** Ein Seitenzustand, wie er in `pages[i].state` steht. */
export type PptxPageState = Readonly<Record<string, unknown>>;

export interface BuildPptxModelOptions {
  /** Textbreite für die Höhe der Textboxen; ohne: Schätzung. */
  measure?: PptxMeasureText;
}

/** Schlüssel, die `buildPptxModel` liest. */
export const PPTX_MAPPED_PAGE_KEYS = [
  'backgroundMode',
  'backgroundColor',
  'currentImageSrc',
  'hasBackgroundImage',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'backgroundImageAdjustments',
  'backgroundImageRotation',
  'additionalTexts',
  'shapeInstances',
  'pillBadgeInstances',
  'circleBadgeInstances',
  'chartInstances',
  'userImageInstances',
  'assetInstances',
  'illustrationInstances',
  'frameInstances',
  'selectedIcons',
  'iconStates',
  'layerOrder',
  'notes',
] as const;

/**
 * Schlüssel, die bewusst nicht in die Folie gehen. Ein Schlüssel, der in
 * keiner der beiden Listen steht, landet in `unknownKeys` der Folie — eine
 * neue Elementart ist so eine sichtbare Lücke, kein stiller Verlust.
 */
export const PPTX_UNMAPPED_PAGE_KEYS = {
  isDesktop: 'Editor-Zustand',
  backgroundImageFile: 'Blob des Hintergrundbilds; gezeichnet wird `currentImageSrc`',
  imageAttribution: 'Bildnachweis; steht nicht auf der Fläche',
  stashedComposerPlanes: 'abgelegte Composer-Flächen; nicht gezeichnet',
  lockedLayerIds: 'Sperre im Editor',
  templateRotations: 'Drehung der Vorlagen-Elemente; die gehen nicht in die Folie',
  templateTextAligns: 'Ausrichtung der Vorlagen-Texte; die gehen nicht in die Folie',
} as const satisfies Record<string, string>;

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  ...PPTX_MAPPED_PAGE_KEYS,
  ...Object.keys(PPTX_UNMAPPED_PAGE_KEYS),
]);

/** The lists of the host kinds that go onto the slide (`registerElementKind` with `pptx`). */
const hostPptxKeys = fromHostKinds(
  (kinds) => new Set<string>(kinds.filter((kind) => kind.pptx).map((kind) => kind.stateKey))
);

/** The mapped page keys, the host kinds' lists included. */
export function pptxMappedPageKeys(): readonly string[] {
  return [...PPTX_MAPPED_PAGE_KEYS, ...hostPptxKeys()];
}

/** Formen, die PowerPoint selbst zeichnet; alle anderen werden gerastert. */
const NATIVE_SHAPES: Partial<Record<ShapeInstance['type'], PptxShapeKind>> = {
  rect: 'rect',
  'rounded-rect': 'roundRect',
  circle: 'ellipse',
  ellipse: 'ellipse',
  triangle: 'triangle',
  star: 'star5',
};

type NativeChart = Pick<PptxChartItem, 'chartType' | 'barDir'>;

const NATIVE_CHARTS: Record<ChartType, NativeChart> = {
  bar: { chartType: 'bar', barDir: 'col' },
  'bar-horizontal': { chartType: 'bar', barDir: 'bar' },
  line: { chartType: 'line', barDir: null },
  area: { chartType: 'area', barDir: null },
  pie: { chartType: 'pie', barDir: null },
  donut: { chartType: 'doughnut', barDir: null },
};

// ============================================================================
// GEOMETRY
// ============================================================================

interface Placement {
  box: PptxBox;
  rotation: number;
}

/**
 * Eine Box im lokalen Raum eines Konva-Knotens (Ursprung `origin`, gedreht um
 * den Ursprung, skaliert) → ungedrehte Seitenbox, die um ihre Mitte gedreht
 * genau dort liegt.
 */
function place(
  origin: { x: number; y: number },
  rotation: number,
  scaleX: number,
  scaleY: number,
  local: PptxBox
): Placement {
  const cx = (local.x + local.width / 2) * scaleX;
  const cy = (local.y + local.height / 2) * scaleY;
  const rad = (rotation * Math.PI) / 180;
  const centerX = origin.x + cx * Math.cos(rad) - cy * Math.sin(rad);
  const centerY = origin.y + cx * Math.sin(rad) + cy * Math.cos(rad);
  const width = local.width * scaleX;
  const height = local.height * scaleY;
  return {
    box: { x: centerX - width / 2, y: centerY - height / 2, width, height },
    rotation,
  };
}

function raster(
  elementId: string,
  placement: Placement,
  reason: PptxRasterReason,
  boxExact = true
): PptxRasterRequest {
  return { kind: 'raster', elementId, ...placement, reason, boxExact };
}

function shadowOf(source: {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
}): PptxShadow | null {
  if (!source.shadowColor) return null;
  return {
    color: source.shadowColor,
    blur: source.shadowBlur ?? 0,
    offsetX: source.shadowOffsetX ?? 0,
    offsetY: source.shadowOffsetY ?? 0,
    opacity: source.shadowOpacity ?? 1,
  };
}

// ============================================================================
// ELEMENT MAPPERS
// ============================================================================

/** Lokale Box einer Form um ihren Ankerpunkt (Konva zentriert alle Formen). */
function shapeLocalBox(shape: ShapeInstance): PptxBox {
  const r = shape.width / 2;
  switch (shape.type) {
    case 'circle':
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    case 'triangle': {
      // RegularPolygon: Umkreis r, Spitze oben.
      const half = (r * Math.sqrt(3)) / 2;
      return { x: -half, y: -r, width: 2 * half, height: 1.5 * r };
    }
    case 'star': {
      const half = r * Math.sin((72 * Math.PI) / 180);
      return { x: -half, y: -r, width: 2 * half, height: r + r * Math.cos((36 * Math.PI) / 180) };
    }
    default:
      return {
        x: -shape.width / 2,
        y: -shape.height / 2,
        width: shape.width,
        height: shape.height,
      };
  }
}

function mapShape(shape: ShapeInstance): PptxItem {
  const placement = place(
    shape,
    shape.rotation ?? 0,
    shape.scaleX ?? 1,
    shape.scaleY ?? 1,
    shapeLocalBox(shape)
  );
  const native = NATIVE_SHAPES[shape.type];
  if (!native) return raster(shape.id, placement, 'shape-path');
  // A native pptx shape can't carry the mirror the stage draws; the raster does.
  if (shape.flipX || shape.flipY) return raster(shape.id, placement, 'shape-flipped');
  if (shape.fillGradient || shape.blendMode) {
    return raster(shape.id, placement, 'shape-styled');
  }
  return {
    kind: 'shape',
    id: shape.id,
    ...placement,
    opacity: shape.opacity ?? 1,
    shape: native,
    fill: shape.fill,
    rectRadius:
      native === 'roundRect'
        ? Math.min(shape.cornerRadius ?? 32, placement.box.width / 2, placement.box.height / 2)
        : null,
    shadow: shadowOf(shape),
  };
}

function mapText(text: AdditionalText, measure: PptxMeasureText): PptxItem {
  const scale = text.scale || 1;
  const lineHeight = text.lineHeight ?? 1.2;
  const paragraphs = textParagraphs(text);
  const style = text.fontStyle ?? 'normal';
  const lines = wrappedLineCount(
    paragraphs,
    text.width,
    text.fontSize,
    text.fontFamily,
    style,
    measure
  );
  const local = { x: 0, y: 0, width: text.width, height: lines * text.fontSize * lineHeight };
  const placement = place(text, text.rotation || 0, scale, scale, local);
  if (text.fillGradient) return raster(text.id, placement, 'text-gradient');
  return {
    kind: 'text',
    id: text.id,
    ...placement,
    opacity: text.opacity ?? 1,
    paragraphs,
    fontFace: text.fontFamily,
    fontSize: text.fontSize * scale,
    color: text.fill,
    bold: style.includes('bold'),
    italic: style.includes('italic'),
    align: text.align ?? 'left',
    valign: 'top',
    lineHeight,
    outline:
      text.stroke && (text.strokeWidth ?? 0) > 0
        ? { color: text.stroke, width: text.strokeWidth! * scale }
        : null,
    shadow: shadowOf(text),
  };
}

/** Pille: abgerundetes Rechteck plus zentrierter Text, beide in der Pillenbox. */
function mapPill(pill: PillBadgeInstance, measure: PptxMeasureText): PptxItem[] {
  const textWidth = measure(pill.text, pill.fontSize, pill.fontFamily, pill.fontStyle);
  const local = {
    x: 0,
    y: 0,
    width: textWidth + pill.paddingX * 2,
    height: pill.fontSize + pill.paddingY * 2,
  };
  const scale = pill.scale || 1;
  const placement = place(pill, pill.rotation || 0, scale, scale, local);
  const opacity = pill.opacity ?? 1;
  const style = pill.fontStyle ?? 'normal';
  return [
    {
      kind: 'shape',
      id: pill.id,
      ...placement,
      opacity,
      shape: 'roundRect',
      fill: pill.backgroundColor,
      rectRadius: Math.min(
        pill.cornerRadius * scale,
        placement.box.width / 2,
        placement.box.height / 2
      ),
      shadow: null,
    },
    {
      kind: 'text',
      id: `${pill.id}#text`,
      ...placement,
      opacity,
      paragraphs: [
        {
          runs: [
            {
              text: pill.text,
              bold: false,
              italic: false,
              underline: false,
              color: pill.textColor,
              highlight: null,
              fontFace: null,
            },
          ],
          bullet: null,
        },
      ],
      fontFace: pill.fontFamily,
      fontSize: pill.fontSize * scale,
      color: pill.textColor,
      bold: style.includes('bold'),
      italic: style.includes('italic'),
      align: 'center',
      valign: 'middle',
      lineHeight: 1,
      outline: null,
      shadow: null,
    },
  ];
}

/** Kreis-Badge: Kreis plus eine Textbox je Zeile, wie `CircleBadge` sie setzt. */
function mapCircleBadge(badge: CircleBadgeInstance): PptxItem[] {
  const scale = badge.scale || 1;
  const rotation = badge.rotation || 0;
  const opacity = badge.opacity ?? 1;
  const r = badge.radius;
  const items: PptxItem[] = [
    {
      kind: 'shape',
      id: badge.id,
      ...place(badge, rotation, scale, scale, { x: -r, y: -r, width: 2 * r, height: 2 * r }),
      opacity,
      shape: 'ellipse',
      fill: badge.backgroundColor,
      rectRadius: null,
      shadow: null,
    },
  ];
  badge.textLines.forEach((line, index) => {
    const local = {
      x: -r,
      y: line.yOffset - line.fontSize / 2,
      width: 2 * r,
      height: line.fontSize,
    };
    items.push({
      kind: 'text',
      id: `${badge.id}#line-${index}`,
      ...place(badge, rotation, scale, scale, local),
      opacity,
      paragraphs: [
        {
          runs: [
            {
              text: line.text,
              bold: false,
              italic: false,
              underline: false,
              color: badge.textColor,
              highlight: null,
              fontFace: null,
            },
          ],
          bullet: null,
        },
      ],
      fontFace: line.fontFamily,
      fontSize: line.fontSize * scale,
      color: badge.textColor,
      bold: line.fontWeight === 'bold',
      italic: false,
      align: 'center',
      valign: 'top',
      lineHeight: 1,
      outline: null,
      shadow: null,
    });
  });
  return items;
}

/** Eine Bildbearbeitung, die PowerPoint nicht nachbauen kann. */
function isAdjusted(image: ImageAdjustments): boolean {
  return (
    !!image.blur ||
    !!image.brightness ||
    !!image.contrast ||
    !!image.saturation ||
    !!image.hue ||
    !!image.temperature ||
    !!image.grayscale ||
    !!image.sepia ||
    !!image.invert ||
    !!image.tint ||
    !!image.vignette ||
    !!image.flipX ||
    !!image.flipY
  );
}

function mapUserImage(image: UserImageInstance): PptxItem {
  const scale = image.scale || 1;
  const placement = place(image, image.rotation || 0, scale, scale, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });
  // PPTX kann ein im Rahmen gedrehtes Foto nicht ausdrücken: begradigt wird gerastert.
  const movedCrop =
    image.fit === 'cover' &&
    ((image.cropZoom ?? 1) !== 1 || !!image.panX || !!image.panY || !!image.cropRotation);
  const ovalMask = image.mask === 'kreis' && Math.abs(image.width - image.height) > 0.5;
  if (isAdjusted(image) || image.shadowColor || movedCrop || ovalMask) {
    return raster(image.id, placement, 'image-adjusted');
  }
  return {
    kind: 'image',
    id: image.id,
    ...placement,
    opacity: image.opacity ?? 1,
    src: image.src,
    fit: image.fit === 'cover' ? 'cover' : 'stretch',
    rounding: image.mask === 'kreis',
  };
}

function mapChart(chart: ChartInstance): PptxItem {
  const scale = chart.scale || 1;
  const placement = place(chart, chart.rotation || 0, scale, scale, {
    x: 0,
    y: 0,
    width: chart.width,
    height: chart.height,
  });
  // Ein Diagrammtyp aus einem neueren Dokument steht nicht in der Tabelle.
  const native = (NATIVE_CHARTS as Partial<Record<string, NativeChart>>)[chart.chartType];
  if (!native) return raster(chart.id, placement, 'chart-unmapped');
  const series = chartSeries(chart);
  return {
    kind: 'chart',
    id: chart.id,
    ...placement,
    opacity: chart.opacity ?? 1,
    chartType: native.chartType,
    barDir: native.barDir,
    labels: chart.data.map((point) => point.name),
    series: series ?? [{ name: chart.title || 'Werte', values: chart.data.map((p) => p.value) }],
    colors: chart.colors,
    title: chart.title || null,
    unit: chart.unit || null,
    // Wie auf der Folie: eine einzelne Reihe eines Säulen- oder Liniendiagramms hat keine Legende.
    showLegend: chart.showLegend && (series !== null || isRoundChartType(chart.chartType)),
    legendPosition: chartLegendPosition(chart) === 'right' ? 'r' : 'b',
    showGrid: chart.showGrid,
    showValues: chart.showValues,
    textColor: chartInk(chart),
  };
}

/** Ein mittig verankertes Motiv mit quadratischer Grundgröße. */
function centeredSquare(
  element: { x: number; y: number; scale?: number; rotation?: number },
  size: number
): Placement {
  const scale = element.scale || 1;
  return place(element, element.rotation || 0, scale, scale, {
    x: -size / 2,
    y: -size / 2,
    width: size,
    height: size,
  });
}

// ============================================================================
// PAGE
// ============================================================================

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isIdList(value: unknown): value is { id: string }[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        !!entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
    )
  );
}

/** Ids der Hintergrund-Elemente der Freeform-Config (`freeform_full.config.tsx`). */
const BACKGROUND_COLOR_ID = 'background-color';
const BACKGROUND_IMAGE_ID = 'background-image';

/** Das Hintergrundfoto: nativ nur unbearbeitet, mittig, ganzflächig — sonst gerastert. */
function mapBackgroundPhoto(state: PptxPageState, page: PptxBox): PptxItem | null {
  const src = state.currentImageSrc;
  if (state.backgroundMode !== 'image' || !state.hasBackgroundImage || typeof src !== 'string') {
    return null;
  }
  const offset = state.imageOffset as { x?: number; y?: number } | null;
  const scale = typeof state.imageScale === 'number' ? state.imageScale : 1;
  const opacity =
    typeof state.backgroundImageOpacity === 'number' ? state.backgroundImageOpacity : 1;
  const adjustments = state.backgroundImageAdjustments as ImageAdjustments | null;
  const strip = photoStripBeside(list<ShapeInstance>(state.shapeInstances), page);
  // Ein im Rahmen gedrehtes Foto hat in PPTX keine Entsprechung: es wird gerastert.
  const straightened = backgroundStraighten(state as Record<string, unknown>) !== null;
  const plain =
    !offset?.x &&
    !offset?.y &&
    !straightened &&
    scale === 1 &&
    opacity === 1 &&
    !strip &&
    !(adjustments && isAdjusted(adjustments));
  if (!plain) return raster(BACKGROUND_IMAGE_ID, { box: page, rotation: 0 }, 'background-adjusted');
  return {
    kind: 'image',
    id: BACKGROUND_IMAGE_ID,
    box: page,
    rotation: 0,
    opacity: 1,
    src,
    fit: 'cover',
    rounding: false,
  };
}

function buildSlide(
  state: PptxPageState,
  format: CanvasFormat,
  measure: PptxMeasureText
): PptxSlideModel {
  const page: PptxBox = { x: 0, y: 0, width: format.width, height: format.height };
  const carried = carryInstanceState(state as Record<string, unknown>);

  // In der Standardreihenfolge von `buildCanvasItems`.
  const entries: Array<[string, () => PptxItem[]]> = [];
  const add = (id: string, map: () => PptxItem | PptxItem[]) =>
    entries.push([id, () => [map()].flat()]);

  for (const kind of hostElementKinds()) {
    const pptx = kind.pptx?.bind(kind);
    if (!pptx) continue;
    for (const data of kindList(state, kind.stateKey) as { id: string }[]) {
      // Boundary: the list under this registration's own key holds its instances.
      add(data.id, () => pptx(data as never, page));
    }
  }
  for (const iconId of carried.selectedIcons) {
    const icon = carried.iconStates[iconId];
    const at = icon ?? { x: format.width / 2, y: format.height / 2, scale: 1, rotation: 0 };
    add(iconId, () => raster(iconId, centeredSquare(at, ICON_TARGET_SIZE), 'icon'));
  }
  for (const shape of carried.shapeInstances) add(shape.id, () => mapShape(shape));
  for (const frame of carried.frameInstances) {
    add(frame.id, () =>
      raster(
        frame.id,
        place(frame, frame.rotation || 0, frame.scaleX ?? 1, frame.scaleY ?? 1, {
          x: -frame.width / 2,
          y: -frame.height / 2,
          width: frame.width,
          height: frame.height,
        }),
        'frame'
      )
    );
  }
  for (const text of carried.additionalTexts) add(text.id, () => mapText(text, measure));
  for (const illustration of carried.illustrationInstances) {
    add(illustration.id, () =>
      raster(
        illustration.id,
        centeredSquare(illustration, ILLUSTRATION_TARGET_SIZE),
        'illustration'
      )
    );
  }
  for (const asset of carried.assetInstances) {
    // Die Bildmaße stehen nicht im Zustand: ASSET_TARGET_SIZE ist die längere Kante.
    add(asset.id, () => raster(asset.id, centeredSquare(asset, ASSET_TARGET_SIZE), 'asset', false));
  }
  for (const badge of carried.circleBadgeInstances) add(badge.id, () => mapCircleBadge(badge));
  for (const pill of carried.pillBadgeInstances) add(pill.id, () => mapPill(pill, measure));
  for (const image of carried.userImageInstances) add(image.id, () => mapUserImage(image));
  for (const chart of carried.chartInstances) add(chart.id, () => mapChart(chart));

  // Unbekannte Sammlungen von Elementen mit Id: gerastert statt verloren.
  const hostKeys = hostPptxKeys();
  const unknownKeys = Object.keys(state).filter(
    (key) => !KNOWN_KEYS.has(key) && !hostKeys.has(key)
  );
  for (const key of unknownKeys) {
    const value = state[key];
    if (!isIdList(value)) continue;
    for (const element of value) {
      add(element.id, () => raster(element.id, { box: page, rotation: 0 }, 'unknown', false));
    }
  }

  const byId = new Map(entries);
  const ordered: string[] = [];
  for (const id of carried.layerOrder) {
    if (ordered.includes(id)) continue;
    ordered.push(id);
  }
  for (const [id] of entries) if (!ordered.includes(id)) ordered.push(id);

  // Die Hintergrund-Ebenen der Freeform-Config. Stehen sie nicht in
  // `layerOrder`, liegen sie zuunterst (`buildSortedRenderList`); `moveLayerTo`
  // schreibt sie aber mit hinein, dann gilt ihre Stelle dort.
  const background = mapBackgroundPhoto(state, page);
  const items: PptxItem[] = [];
  if (background && !ordered.includes(BACKGROUND_IMAGE_ID)) items.push(background);
  for (const id of ordered) {
    // Die Farbfläche trägt der Folienhintergrund.
    if (id === BACKGROUND_COLOR_ID) continue;
    if (id === BACKGROUND_IMAGE_ID) {
      if (background) items.push(background);
      continue;
    }
    const map = byId.get(id);
    // Eine Id in `layerOrder` ohne bekannte Sammlung: eine Elementart, die
    // dieses Modul nicht kennt. Der Writer findet den Knoten trotzdem.
    items.push(...(map ? map() : [raster(id, { box: page, rotation: 0 }, 'unknown', false)]));
  }

  return {
    background: {
      // Konva zeichnet die Farbfläche nur im Farbmodus; im Fotomodus liegt
      // unter dem Foto nichts — auch nicht hinter einem halbtransparenten.
      color:
        state.backgroundMode !== 'image' && typeof state.backgroundColor === 'string'
          ? state.backgroundColor
          : null,
    },
    items,
    notes: typeof state.notes === 'string' && state.notes.trim() ? state.notes : null,
    unknownKeys,
  };
}

/** Alle Seiten eines Dokuments → PPTX-Modell, eine Folie je Seite. */
export function buildPptxModel(
  pages: ReadonlyArray<PptxPageState>,
  format: CanvasFormat,
  options: BuildPptxModelOptions = {}
): PptxDeckModel {
  const measure = options.measure ?? estimateMeasure;
  return {
    page: { width: format.width, height: format.height },
    slides: pages.map((state) => buildSlide(state, format, measure)),
  };
}
