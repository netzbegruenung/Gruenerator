export interface ColorPair {
  background: string;
  text: string;
}

export interface CanvasColors {
  TANNE: string;
  KLEE: string;
  GRASHALM: string;
  SAND: string;
  HIMMEL: string;
  ZITAT_BG: string;
}

export interface CanvasParams {
  CANVAS_SIZE: number;
  MIN_FONT_SIZE: number;
  MAX_FONT_SIZE: number;
  DEFAULT_FONT_SIZE: number;
  DEFAULT_BALKEN_GRUPPEN_OFFSET: [number, number];
  DEFAULT_BALKEN_OFFSET: [number, number, number];
  DEFAULT_SUNFLOWER_POSITION: SunflowerPosition;
  DEFAULT_SUNFLOWER_OFFSET: [number, number];
  DEFAULT_COLORS: [ColorPair, ColorPair, ColorPair];
  BALKEN_HEIGHT_FACTOR: number;
  TEXT_PADDING_FACTOR: number;
  SUNFLOWER_SIZE_FACTOR: number;
  SUNFLOWER_OVERLAP_FACTOR: number;
  OUTPUT_WIDTH: number;
  OUTPUT_HEIGHT: number;
  MAX_BALKEN_GRUPPEN_OFFSET: number;
  MIN_BALKEN_GRUPPEN_OFFSET: number;
  MAX_BALKEN_OFFSET: number;
  MIN_BALKEN_OFFSET: number;
  MAX_SUNFLOWER_OFFSET: number;
  MIN_SUNFLOWER_OFFSET: number;
  MAX_CREDIT_LENGTH?: number | undefined;
}

export type SunflowerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface SharepicInputParams {
  balkenGruppenOffset?: [number?, number?] | undefined;
  fontSize?: number | string | undefined;
  colors?: ColorPair[] | undefined;
  credit?: string | undefined;
  balkenOffset?: [number?, number?, number?] | undefined;
  sunflowerPosition?: string | undefined;
  sunflowerOffset?: [number?, number?] | undefined;
  text?: string[] | undefined;
  canvasSize?: number | undefined;
  balkenHeightFactor?: number | undefined;
  textPaddingFactor?: number | undefined;
  sunflowerSizeFactor?: number | undefined;
  sunflowerOverlapFactor?: number | undefined;
}

export interface ValidatedSharepicParams {
  balkenGruppenOffset: [number, number];
  fontSize: number;
  colors: [ColorPair, ColorPair, ColorPair];
  credit: string;
  balkenOffset: [number, number, number];
  sunflowerPosition: SunflowerPosition;
  sunflowerOffset: [number, number];
  text: [string, string, string];
  canvasSize: number;
  balkenHeightFactor: number;
  textPaddingFactor: number;
  sunflowerSizeFactor: number;
  sunflowerOverlapFactor: number;
}

export type ImageFormat = 'png' | 'webp';

export interface ImageOptimizationOptions {
  format?: ImageFormat | undefined;
  quality?: number | undefined;
  compressionLevel?: number | undefined;
}
