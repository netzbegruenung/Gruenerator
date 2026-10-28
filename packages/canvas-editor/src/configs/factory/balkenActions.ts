/**
 * Balken actions — the Grünerator's brand element, kept out of the neutral
 * `@ggraphic/editor` core (`createElementActions`).
 */

import { duplicateElementInState } from '@ggraphic/editor/utils/duplicateElement';

import { createBalkenInstanceFromPreset } from '../../brand/balkenPresets';
import {
  BALKEN_FIT_MARGIN,
  BALKEN_FIT_MIN_SCALE,
  balkenExtent,
  fitBalkenAfterTextEdit,
} from '../../utils/balkenBounds';

import type { BalkenInstance, BalkenMode } from '@ggraphic/editor/utils/balkenUtils';
import type { ElementPlacement } from '@ggraphic/editor/utils/userImageUtils';

type StateSetter<TState> = (partial: Partial<TState> | ((prev: TState) => TState)) => void;
type HistorySaver<TState> = (state: TState) => void;

export function createBalkenActions<TState extends { balkenInstances: BalkenInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number
) {
  return {
    addBalken: (mode: BalkenMode, options?: ElementPlacement) => {
      const preset = createBalkenInstanceFromPreset(mode);
      let newBalken = preset;
      if (options?.center) {
        // The bars lay out around the canvas centre; `offset` moves the group.
        const box = balkenExtent(preset, canvasWidth, canvasHeight);
        newBalken = {
          ...preset,
          offset: {
            x: options.center.x - (box.left + box.right) / 2,
            y: options.center.y - (box.top + box.bottom) / 2,
          },
        };
      }
      setState((prev) => ({
        ...prev,
        balkenInstances: [...prev.balkenInstances, newBalken],
      }));
      saveToHistory(getState());
    },
    updateBalken: (id: string, partial: Partial<BalkenInstance>) => {
      setState((prev) => ({
        ...prev,
        balkenInstances: prev.balkenInstances.map((b) => (b.id === id ? { ...b, ...partial } : b)),
      }));
      debouncedSaveToHistory(getState());
    },
    setBalkenText: (id: string, index: number, text: string) => {
      setState((prev) => ({
        ...prev,
        balkenInstances: prev.balkenInstances.map((b) => {
          if (b.id !== id) return b;
          const next = { ...b, texts: b.texts.map((t, i) => (i === index ? text : t)) };
          const fit = fitBalkenAfterTextEdit(
            b,
            next,
            canvasWidth,
            canvasHeight,
            BALKEN_FIT_MARGIN,
            BALKEN_FIT_MIN_SCALE
          );
          return fit ? { ...next, ...fit } : next;
        }),
      }));
      debouncedSaveToHistory(getState());
    },
    removeBalken: (id: string) => {
      setState((prev) => ({
        ...prev,
        balkenInstances: prev.balkenInstances.filter((b) => b.id !== id),
      }));
      saveToHistory(getState());
    },
    duplicateBalken: (balkenId: string) => {
      const result = duplicateElementInState(getState(), balkenId);
      if (!result) return;
      setState(result.state);
      saveToHistory(result.state);
    },
  };
}
