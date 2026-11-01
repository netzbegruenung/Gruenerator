// SPDX-License-Identifier: MPL-2.0
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToolbarHandlers } from '@ggraphic/editor/components/CanvasEditor/hooks/useToolbarHandlers';

import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';

describe('useToolbarHandlers: handleTextFormatChange', () => {
  it('asks the page that is current when the button is pressed, not the one at render', () => {
    const handleTextFormatChange = vi.fn();
    const canvasRefsRef = { current: [] as { current: GenericCanvasRef | null }[] };
    const { result } = renderHook(() =>
      useToolbarHandlers({
        canvasRefsRef,
        currentPageIndex: 0,
        pageOpStamps: () => ({ element: null, page: null }) as never,
        undoPageOp: () => {},
        redoPageOp: () => {},
        discardReplaceDeck: () => {},
      })
    );
    // The pages arrive after the first render (collab editor).
    canvasRefsRef.current = [
      { current: { handleTextFormatChange } as unknown as GenericCanvasRef },
    ];
    result.current.handleTextFormatChange('t1', '**Hallo**');
    expect(handleTextFormatChange).toHaveBeenCalledExactlyOnceWith('t1', '**Hallo**');
  });
});
