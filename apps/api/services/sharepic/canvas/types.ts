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
  MAX_CREDIT_LENGTH?: number;
}

export type SunflowerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface SharepicInputParams {
  balkenGruppenOffset?: [number?, number?];
  fontSize?: number | string;
  colors?: ColorPair[];
  credit?: string;
  balkenOffset?: [number?, number?, number?];
  sunflowerPosition?: string;
  sunflowerOffset?: [number?, number?];
  text?: string[];
  canvasSize?: number;
  balkenHeightFactor?: number;
  textPaddingFactor?: number;
  sunflowerSizeFactor?: number;
  sunflowerOverlapFactor?: number;
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
  format?: ImageFormat;
  quality?: number;
  compressionLevel?: number;
}
