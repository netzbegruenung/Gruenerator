// SPDX-License-Identifier: MPL-2.0
/**
 * Ein Handler, den ein memoisiertes Kind hält, kann älter sein als der
 * Zustand (#4909). Er darf deshalb nicht aus seinem Render-`state` den ganzen
 * nächsten Zustand bauen — sonst überschreibt er, was seither committet wurde.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCanvasElementHandlers } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';
import type { OptionalCanvasActions } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

type State = Record<string, unknown>;

const config = {
  elements: [
    { id: 'headline', type: 'text', textKey: 'headline', fontSizeStateKey: 'headlineFontSize' },
    { id: 'arrow', type: 'image', positionStateKey: 'arrowPosition' },
  ],
} as unknown as FullCanvasConfig<State, OptionalCanvasActions>;

function staleHandlers() {
  const renderState: State = { headlineFontSize: 40, arrowPosition: { x: 0, y: 0 }, rotation: 0 };
  // The committed state moved on after the handlers last rendered.
  let committed: State = { ...renderState, rotation: 90 };
  const setState = (partial: Partial<State> | ((prev: State) => State)) => {
    committed = typeof partial === 'function' ? partial(committed) : { ...committed, ...partial };
  };
  const { result } = renderHook(() =>
    useCanvasElementHandlers({
      config,
      state: renderState,
      setState,
      actions: {},
      layout: {} as LayoutResult,
      callbacks: {},
      selectElement: () => {},
      updateElementPosition: () => {},
      saveToHistory: () => {},
      debouncedSaveToHistory: () => {},
    })
  );
  return { handlers: result.current, committed: () => committed };
}

describe('element handlers with a stale render state', () => {
  it('keeps changes committed since render when the template font size changes', () => {
    const { handlers, committed } = staleHandlers();
    handlers.handleFontSizeChange('headline', 64);
    expect(committed()).toMatchObject({ headlineFontSize: 64, rotation: 90 });
  });

  it('keeps changes committed since render when a positioned image is dragged', () => {
    const { handlers, committed } = staleHandlers();
    handlers.handleImageDragEnd('arrow', 10, 20);
    expect(committed()).toMatchObject({ arrowPosition: { x: 10, y: 20 }, rotation: 90 });
  });
});
