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

export { createBaseActions } from './baseActions';

export { wrapWithAi } from './wrapWithAi';
export { createAiCapabilities } from './createAiCapabilities';
export type { AiTextField, CreateAiCapabilitiesOptions } from './createAiCapabilities';

export { fromLayout } from '@ggraphic/editor/configs/factory/layoutAccessors';
export {
  createPrimaryText,
  createSecondaryText,
} from '@ggraphic/editor/configs/factory/createTextElement';
export { makeSectionDefiner } from '@ggraphic/editor/configs/factory/defineSection';
export {
  carryInstanceState,
  CARRIED_INSTANCE_KEYS,
} from '@ggraphic/editor/configs/factory/carryInstanceState';
export type { CarriedInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';

export type {
  BaseCanvasState,
  BaseCanvasActions,
  IconState,
  CanvasFeatures,
  CanvasDimensions,
} from '@ggraphic/editor/configs/factory/baseTypes';
