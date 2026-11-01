// SPDX-License-Identifier: MPL-2.0
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasElementHandlers } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';
import type { OptionalCanvasActions } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

type State = Record<string, unknown>;

const brand: BrandPack = {
  ...brandDefault,
  fonts: {
    headline: 'Alpha Sans',
    body: 'Beta Serif',
    quoteShort: 'Alpha Sans',
    quoteEmphasis: 'Gamma Slab',
  },
};

function handlersWith(actions: OptionalCanvasActions, withBrand = true) {
  const { result } = renderHook(() =>
    useCanvasElementHandlers({
      config: {
        elements: [{ id: 'headline', type: 'text', textKey: 'headline' }],
        ...(withBrand ? { brand } : {}),
      } as unknown as FullCanvasConfig<State, OptionalCanvasActions>,
      state: { additionalTexts: [{ id: 'free-1' }] },
      setState: () => {},
      actions,
      layout: {} as LayoutResult,
      callbacks: {},
      selectElement: () => {},
      updateElementPosition: () => {},
      saveToHistory: () => {},
      debouncedSaveToHistory: () => {},
    })
  );
  return result.current;
}

describe('handleFontRoleChange', () => {
  it('writes family and binding of the role of the page brand in one update', () => {
    const updateAdditionalText = vi.fn();
    handlersWith({ updateAdditionalText }).handleFontRoleChange('free-1', 'quoteEmphasis');
    expect(updateAdditionalText).toHaveBeenCalledExactlyOnceWith('free-1', {
      fontFamily: 'Gamma Slab',
      bind: { fontFamily: { ref: 'font.quoteEmphasis', value: 'Gamma Slab' } },
    });
  });

  it('leaves a template text alone', () => {
    const updateAdditionalText = vi.fn();
    handlersWith({ updateAdditionalText }).handleFontRoleChange('headline', 'body');
    expect(updateAdditionalText).not.toHaveBeenCalled();
  });

  it('leaves a role the brand does not set alone', () => {
    const updateAdditionalText = vi.fn();
    handlersWith({ updateAdditionalText }).handleFontRoleChange('free-1', 'handwriting');
    expect(updateAdditionalText).not.toHaveBeenCalled();
  });

  it('does nothing when the host has no such action', () => {
    expect(() => handlersWith({}).handleFontRoleChange('free-1', 'body')).not.toThrow();
  });
});
