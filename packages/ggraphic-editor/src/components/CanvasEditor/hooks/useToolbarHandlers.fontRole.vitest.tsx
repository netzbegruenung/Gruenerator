// SPDX-License-Identifier: MPL-2.0
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToolbarHandlers } from '@ggraphic/editor/components/CanvasEditor/hooks/useToolbarHandlers';

import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';

describe('useToolbarHandlers: handleFontRoleChange', () => {
  it('asks the page that is current when the role is picked, not the one at render', () => {
    const handleFontRoleChange = vi.fn();
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
    canvasRefsRef.current = [{ current: { handleFontRoleChange } as unknown as GenericCanvasRef }];
    result.current.handleFontRoleChange('t1', 'body');
    expect(handleFontRoleChange).toHaveBeenCalledExactlyOnceWith('t1', 'body');
  });
});
