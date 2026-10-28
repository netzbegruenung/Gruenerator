// SPDX-License-Identifier: MPL-2.0
/**
 * Das PPTX-Modell einer Präsentation: was der Writer (pptxgenjs) je Folie
 * zeichnet. Rein und ohne pptxgenjs/Konva, damit die Abbildung testbar bleibt.
 *
 * Geometrie steht in Pixeln der Seite (`PptxDeckModel.page`); der Writer
 * rechnet in Zoll um (`inch = px * 13.333 / page.width`). Eine Box ist
 * ungedreht, gedreht wird um ihre Mitte — die Konvention von PowerPoint.
 * Konva dreht meist um die linke obere Ecke; `buildPptxModel` rechnet das um.
 */

import type { HostElementKindName } from '../../utils/canvasItem.js';

export interface PptxBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PptxShadow {
  color: string;
  /** px */
  blur: number;
  /** px */
  offsetX: number;
  /** px */
  offsetY: number;
  /** 0..1 */
  opacity: number;
}

interface PptxPlaced {
  /** Die Element-Id im Seitenzustand. */
  id: string;
  box: PptxBox;
  /** Grad im Uhrzeigersinn, um die Mitte der Box. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

export type PptxShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'star5';

export interface PptxShapeItem extends PptxPlaced {
  kind: 'shape';
  shape: PptxShapeKind;
  fill: string;
  /** Eckenradius in px (nur `roundRect`). */
  rectRadius: number | null;
  shadow: PptxShadow | null;
}

export interface PptxTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  /** Kasten hinter dem Lauf (`++Marker++`). */
  highlight: string | null;
  /** Eigene Schrift des Laufs (Akzentschrift); sonst die des Textfelds. */
  fontFace: string | null;
}

export type PptxBullet = { type: 'bullet' } | { type: 'number'; startAt: number };

export interface PptxParagraph {
  runs: PptxTextRun[];
  bullet: PptxBullet | null;
}

export interface PptxTextItem extends PptxPlaced {
  kind: 'text';
  paragraphs: PptxParagraph[];
  fontFace: string;
  /** px der Seite, Skalierung schon eingerechnet. */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle';
  /** Zeilenhöhe als Vielfaches der Schriftgröße. */
  lineHeight: number;
  outline: { color: string; width: number } | null;
  shadow: PptxShadow | null;
}

export interface PptxImageItem extends PptxPlaced {
  kind: 'image';
  src: string;
  /** `cover`: mittig zugeschnitten auf die Box; `stretch`: das ganze Bild in die Box. */
  fit: 'cover' | 'stretch';
  /** Kreisförmig zugeschnitten (quadratische Box). */
  rounding: boolean;
}

export type PptxChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut';

export interface PptxChartItem extends PptxPlaced {
  kind: 'chart';
  chartType: PptxChartType;
  /** Nur bei `bar`: Säulen (`col`) oder Balken (`bar`). */
  barDir: 'col' | 'bar' | null;
  labels: string[];
  /** Eine Reihe je Datenreihe des Diagramms, mindestens eine. */
  series: { name: string; values: number[] }[];
  colors: string[];
  title: string | null;
  unit: string | null;
  showLegend: boolean;
  legendPosition: 'r' | 'b';
  showGrid: boolean;
  showValues: boolean;
  /** Achsen, Legende, Werte und Titel (`chartInk`): weiß auf dunklem Grund. */
  textColor: string;
}

/** Warum ein Element als Bild statt nativ in die Folie geht. */
export type PptxRasterReason =
  | 'background-adjusted'
  | 'shape-path'
  | 'shape-styled'
  | 'shape-flipped'
  | 'text-gradient'
  | 'image-adjusted'
  | 'chart-unmapped'
  | 'icon'
  | 'illustration'
  | 'asset'
  | 'frame'
  | 'unknown'
  /** A host kind rasters under its own name (`registerElementKind`). */
  | HostElementKindName;

/**
 * Ein Element, das der Writer vom Stage rastert. `elementId` ist die Id im
 * Seitenzustand — dieselbe, die `CanvasRenderLayer` als `canvasItemId` an die
 * Hüllgruppe (`name="canvas-item"`) jedes Elements schreibt.
 */
export interface PptxRasterRequest {
  kind: 'raster';
  elementId: string;
  box: PptxBox;
  rotation: number;
  reason: PptxRasterReason;
  /**
   * `false`: die Größe steht nicht im Zustand (Asset-Bildmaße, manche Host-Art), die
   * Box ist eine Schätzung — der Writer nimmt die Maße des Knotens.
   */
  boxExact: boolean;
}

export type PptxItem =
  PptxShapeItem | PptxTextItem | PptxImageItem | PptxChartItem | PptxRasterRequest;

export interface PptxSlideModel {
  /** `null`: keine Füllung (Fotomodus) — PowerPoints Vorgabe. */
  background: { color: string | null };
  /** Von hinten nach vorn. */
  items: PptxItem[];
  /** Sprechernotizen (`notes` im Seitenzustand). */
  notes: string | null;
  /** Schlüssel des Seitenzustands, die weder abgebildet noch bewusst ausgelassen sind. */
  unknownKeys: string[];
}

export interface PptxDeckModel {
  page: { width: number; height: number };
  slides: PptxSlideModel[];
}
