// SPDX-License-Identifier: MPL-2.0
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasElementHandlers } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';
import type { OptionalCanvasActions } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

type State = Record<string, unknown>;

function handlersWith(actions: OptionalCanvasActions) {
  const setState = vi.fn();
  const debouncedSaveToHistory = vi.fn();
  const onHeadlineChange = vi.fn();
  const { result } = renderHook(() =>
    useCanvasElementHandlers({
      config: {
        elements: [{ id: 'headline', type: 'text', textKey: 'headlineText' }],
      } as unknown as FullCanvasConfig<State, OptionalCanvasActions>,
      state: { headlineText: 'Alt', additionalTexts: [{ id: 'free-1' }] },
      setState,
      actions,
      layout: {} as LayoutResult,
      callbacks: { onHeadlineTextChange: onHeadlineChange },
      selectElement: () => {},
      updateElementPosition: () => {},
      saveToHistory: () => {},
      debouncedSaveToHistory,
    })
  );
  return { handlers: result.current, setState, debouncedSaveToHistory, onHeadlineChange };
}

describe('handleTextFormatChange', () => {
  it('hands the formatted text of a free text to the host action, which refits and records it', () => {
    const updateAdditionalText = vi.fn();
    const { handlers } = handlersWith({ updateAdditionalText });
    handlers.handleTextFormatChange('free-1', '**Hallo**');
    expect(updateAdditionalText).toHaveBeenCalledExactlyOnceWith('free-1', { text: '**Hallo**' });
  });

  it('leaves an element that is no text alone', () => {
    const updateAdditionalText = vi.fn();
    const { handlers, setState } = handlersWith({ updateAdditionalText });
    handlers.handleTextFormatChange('nothing', '**Hallo**');
    expect(updateAdditionalText).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it('does nothing when the host has no such action', () => {
    const { handlers } = handlersWith({});
    expect(() => handlers.handleTextFormatChange('free-1', '**Hallo**')).not.toThrow();
  });
});
