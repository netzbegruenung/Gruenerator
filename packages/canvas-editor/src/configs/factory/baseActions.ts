/**
 * The Grünerator's action set: the core's element actions plus Balken.
 */

import { createElementActions } from '@ggraphic/editor/configs/factory/actionFactories';

import { createBalkenActions } from './balkenActions';

import type { BrandPack } from '@ggraphic/core';
import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';

export function createBaseActions<TState extends BaseCanvasState>(
  getState: () => TState,
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void,
  saveToHistory: (state: TState) => void,
  debouncedSaveToHistory: (state: TState) => void,
  canvasWidth: number,
  canvasHeight: number,
  fontColor?: string,
  /** The document's pack (`FullCanvasConfig.brand`); absent: the active brand. */
  brand?: BrandPack,
  /** Startgröße neuer Elemente (`insertScaleFor`); 1 = Sharepic-Werte. */
  insertScale = 1
) {
  return {
    ...createElementActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight,
      fontColor,
      brand,
      insertScale
    ),
    ...createBalkenActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight
    ),
  };
}
