export interface CanvasColors {
  TANNE: string;
  KLEE: string;
  GRASHALM: string;
  SAND: string;
  HIMMEL: string;
  ZITAT_BG: string;
}

export type ImageFormat = 'png' | 'webp';

export interface ImageOptimizationOptions {
  format?: ImageFormat | undefined;
  quality?: number | undefined;
  compressionLevel?: number | undefined;
}
