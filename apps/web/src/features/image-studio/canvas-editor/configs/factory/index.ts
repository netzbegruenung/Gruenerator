/**
 * Canvas Config Factory
 *
 * Provides factory functions for creating canvas configurations with minimal boilerplate.
 * Templates are grouped by their base pattern:
 *
 * - createImageTwoTextCanvas: Image background + 2 text fields (Zitat, Simple)
 * - createColorTwoTextCanvas: Color background + 2 text fields (Zitat Pure, Info)
 */

export { createImageTwoTextCanvas } from './createImageTwoTextCanvas';
export type {
  ImageTwoTextState,
  ImageTwoTextActions,
  ImageTwoTextOptions,
} from './createImageTwoTextCanvas';

export { createColorTwoTextCanvas } from './createColorTwoTextCanvas';
export type {
  ColorTwoTextState,
  ColorTwoTextActions,
  ColorTwoTextOptions,
} from './createColorTwoTextCanvas';

export { createBaseActions } from './commonActions';

export type {
  BaseCanvasState,
  BaseCanvasActions,
  IconState,
  CanvasFeatures,
  CanvasDimensions,
} from './baseTypes';
