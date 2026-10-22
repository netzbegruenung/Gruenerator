/**
 * PPTX-Modell → .pptx mit pptxgenjs. Was das Modell nativ beschreibt, wird ein
 * bearbeitbares PowerPoint-Objekt; jede Raster-Anfrage holt der Aufrufer als
 * PNG vom Stage (`rasterize`). Bilder lädt der Aufrufer (`loadImage`), weil
 * nur er an die Quellen kommt; ein Bild, das nicht lädt, wird gerastert.
 * pptxgenjs kommt erst hier per dynamischem `import()`.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { parseColor, pptxRotation, pptxUnits, transparencyOf, type PptxUnits } from './pptxUnits';
import { shadowProps, textBoxOptions, textRuns } from './writeText';

import type {
  PptxBox,
  PptxChartItem,
  PptxDeckModel,
  PptxImageItem,
  PptxRasterRequest,
  PptxShapeItem,
} from './types';
import type PptxGenJS from 'pptxgenjs';

export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Ein gerastertes Element: PNG plus seine achsparallele Box in Seiten-px (Drehung im Bild). */
export interface PptxRasterImage {
  dataUrl: string;
  box: PptxBox;
}

/** Ein geladenes Bild: PNG/JPEG als Data-URL plus Eigenmaße (für den Zuschnitt). */
export interface PptxLoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface WritePptxDeps {
  /** `null`: Knoten nicht gefunden (veraltete Id) — das Element fehlt dann. */
  rasterize: (request: PptxRasterRequest, slideIndex: number) => Promise<PptxRasterImage | null>;
  /** `null`: Quelle nicht ladbar — das Bild wird dann gerastert. */
  loadImage: (src: string) => Promise<PptxLoadedImage | null>;
  onProgress?: (done: number, total: number) => void;
  title?: string;
}

export interface WritePptxResult {
  blob: Blob;
  /** Raster-Anfragen ohne Knoten, als `<folie>:<elementId>`. */
  skipped: string[];
}

type Slide = PptxGenJS.Slide;

function addShape(slide: Slide, item: PptxShapeItem, units: PptxUnits) {
  const fill = parseColor(item.fill);
  const alpha = (fill?.alpha ?? 1) * item.opacity;
  const shadow = item.shadow ? shadowProps(item.shadow, units) : null;
  slide.addShape(item.shape, {
    x: units.inch(item.box.x),
    y: units.inch(item.box.y),
    w: units.inch(item.box.width),
    h: units.inch(item.box.height),
    fill: fill
      ? { color: fill.hex, ...(alpha < 1 ? { transparency: transparencyOf(alpha) } : {}) }
      : { type: 'none' },
    line: { type: 'none' },
    ...(item.rectRadius !== null ? { rectRadius: units.inch(item.rectRadius) } : {}),
    ...(pptxRotation(item.rotation) ? { rotate: pptxRotation(item.rotation) } : {}),
    ...(shadow ? { shadow } : {}),
    objectName: item.id,
  });
}

function addImage(slide: Slide, item: PptxImageItem, image: PptxLoadedImage, units: PptxUnits) {
  const x = units.inch(item.box.x);
  const y = units.inch(item.box.y);
  const w = units.inch(item.box.width);
  const h = units.inch(item.box.height);
  const common = {
    data: image.dataUrl,
    x,
    y,
    ...(pptxRotation(item.rotation) ? { rotate: pptxRotation(item.rotation) } : {}),
    ...(item.rounding ? { rounding: true } : {}),
    ...(item.opacity < 1 ? { transparency: transparencyOf(item.opacity) } : {}),
    objectName: item.id,
  };
  if (item.fit === 'cover' && image.width > 0 && image.height > 0) {
    // pptxgenjs schneidet nach dem Seitenverhältnis von w/h zu; die Box steht in `sizing`.
    slide.addImage({
      ...common,
      w,
      h: (w * image.height) / image.width,
      sizing: { type: 'cover', w, h },
    });
    return;
  }
  slide.addImage({ ...common, w, h });
}

function addRaster(slide: Slide, image: PptxRasterImage, id: string, units: PptxUnits) {
  slide.addImage({
    data: image.dataUrl,
    x: units.inch(image.box.x),
    y: units.inch(image.box.y),
    w: units.inch(image.box.width),
    h: units.inch(image.box.height),
    objectName: id,
  });
}

const CHART_TYPES = {
  bar: 'bar',
  line: 'line',
  area: 'area',
  pie: 'pie',
  doughnut: 'doughnut',
} as const satisfies Record<PptxChartItem['chartType'], PptxGenJS.CHART_NAME>;

/** Zahlenformat mit Einheit als Literal, z. B. `General" %"`. */
const unitFormat = (unit: string) => `General" ${unit.replace(/["\\]/g, '')}"`;

function addChart(slide: Slide, item: PptxChartItem, units: PptxUnits) {
  const colors = item.colors.flatMap((c) => parseColor(c)?.hex ?? []);
  const isRound = item.chartType === 'pie' || item.chartType === 'doughnut';
  slide.addChart(
    CHART_TYPES[item.chartType],
    [{ name: item.title ?? 'Werte', labels: item.labels, values: item.values }],
    {
      x: units.inch(item.box.x),
      y: units.inch(item.box.y),
      w: units.inch(item.box.width),
      h: units.inch(item.box.height),
      ...(colors.length > 0 ? { chartColors: colors } : {}),
      ...(item.barDir ? { barDir: item.barDir } : {}),
      ...(item.title ? { showTitle: true, title: item.title } : {}),
      showLegend: item.showLegend,
      legendPos: 'b',
      showValue: item.showValues,
      ...(item.showValues && item.unit ? { dataLabelFormatCode: unitFormat(item.unit) } : {}),
      ...(item.chartType === 'doughnut' ? { holeSize: 55 } : {}),
      ...(isRound
        ? {}
        : {
            valGridLine: item.showGrid ? { color: 'D9D9D9', size: 1 } : { style: 'none' as const },
            catGridLine: { style: 'none' as const },
          }),
      objectName: item.id,
    }
  );
}

/** Ein Diagramm, das PowerPoint nicht nativ zeigen kann: gedreht oder durchscheinend. */
const chartNeedsRaster = (item: PptxChartItem) => item.rotation !== 0 || item.opacity < 1;

const asRaster = (item: PptxImageItem | PptxChartItem): PptxRasterRequest => ({
  kind: 'raster',
  elementId: item.id,
  box: item.box,
  rotation: item.rotation,
  reason: item.kind === 'image' ? 'image-adjusted' : 'chart-unmapped',
  boxExact: true,
});

/**
 * pptxgenjs 4.0.1 schreibt für JEDEN Lauf eines Absatzes ein `<a:pPr>` —
 * zwischen den Läufen ist das schemawidrig, und PowerPoint „repariert" die
 * Datei dann beim Öffnen. Hier bleibt je Absatz nur das erste stehen.
 */
export function dropRepeatedParagraphProps(xml: string): string {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (_, inner: string) => {
    let seen = false;
    const fixed = inner.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (props) => {
      if (seen) return '';
      seen = true;
      return props;
    });
    return `<a:p>${fixed}</a:p>`;
  });
}

const SLIDE_XML = /^ppt\/slides\/slide\d+\.xml$/;

function repairSlides(data: ArrayBuffer): Uint8Array {
  const files = unzipSync(new Uint8Array(data));
  for (const [path, bytes] of Object.entries(files)) {
    if (SLIDE_XML.test(path)) files[path] = strToU8(dropRepeatedParagraphProps(strFromU8(bytes)));
  }
  return zipSync(files);
}

export async function writePptx(
  model: PptxDeckModel,
  deps: WritePptxDeps
): Promise<WritePptxResult> {
  const { default: PptxGenJSClass } = await import('pptxgenjs');
  const pres = new PptxGenJSClass();
  pres.layout = 'LAYOUT_WIDE';
  if (deps.title) pres.title = deps.title;
  const units = pptxUnits(model.page.width);
  const skipped: string[] = [];

  const rasterInto = async (slide: Slide, request: PptxRasterRequest, slideIndex: number) => {
    const image = await deps.rasterize(request, slideIndex);
    if (image) addRaster(slide, image, request.elementId, units);
    else skipped.push(`${slideIndex + 1}:${request.elementId}`);
  };

  for (const [slideIndex, slideModel] of model.slides.entries()) {
    const slide = pres.addSlide();
    const background = parseColor(slideModel.background.color);
    if (background) slide.background = { color: background.hex };

    for (const item of slideModel.items) {
      switch (item.kind) {
        case 'shape':
          addShape(slide, item, units);
          break;
        case 'text':
          slide.addText(textRuns(item, units), textBoxOptions(item, units));
          break;
        case 'image': {
          const image = await deps.loadImage(item.src);
          if (image) addImage(slide, item, image, units);
          else await rasterInto(slide, asRaster(item), slideIndex);
          break;
        }
        case 'chart':
          if (chartNeedsRaster(item)) await rasterInto(slide, asRaster(item), slideIndex);
          else addChart(slide, item, units);
          break;
        case 'raster':
          await rasterInto(slide, item, slideIndex);
          break;
      }
    }

    if (slideModel.notes) slide.addNotes(slideModel.notes);
    deps.onProgress?.(slideIndex + 1, model.slides.length);
  }

  if (skipped.length > 0) {
    console.warn(`[writePptx] ${skipped.length} Element(e) ohne Knoten übersprungen:`, skipped);
  }
  const data = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return { blob: new Blob([repairSlides(data) as BlobPart], { type: PPTX_MIME_TYPE }), skipped };
}
