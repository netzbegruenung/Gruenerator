/**
 * Remotion Service Types
 *
 * Type definitions for video rendering with Remotion
 */

/**
 * Font definition for Remotion rendering
 */
export interface FontDefinition {
  family: string;
  file: string;
  weight: string;
}

/**
 * Font loading result
 */
export interface FontLoadResult {
  loaded: string[];
  failed: string[];
}

/**
 * Remotion bundle options
 */
export interface BundleOptions {
  entryPoint: string;
  webpackOverride?: (config: any) => any;
}

/**
 * Remotion render options
 */
export interface RenderOptions {
  composition: string;
  serveUrl: string;
  codec?: string;
  outputLocation?: string;
  inputProps?: Record<string, any>;
  imageFormat?: 'png' | 'jpeg';
  jpegQuality?: number;
  scale?: number;
  verbose?: boolean;
  concurrency?: number;
  frameRange?: [number, number];
  everyNthFrame?: number;
  numberOfGifLoops?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Render progress information
 */
export interface RenderProgress {
  renderedFrames: number;
  encodedFrames: number;
  encodedDoneIn: number | null;
  renderedDoneIn: number | null;
  progress: number;
}

/**
 * Bundle result
 */
export interface BundleResult {
  bundleLocation: string;
}

/**
 * Render result
 */
export interface RenderResult {
  outputPath: string;
  sizeInBytes: number;
}
