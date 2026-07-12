import React, { useMemo } from 'react';

import type { GenericCanvasRef, ToolbarStateReport } from '../../GenericCanvas';
import type { AlignmentDirection } from '../../Toolbar';
import type { ShadowPatch } from '../../../hooks/useFloatingModuleHandlers';
import type { GradientFill } from '../../../utils/gradientFill';

interface UseToolbarHandlersParams {
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  currentPageIndex: number;
  toolbarState: ToolbarStateReport | null;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
  undoPageOp: () => void;
  redoPageOp: () => void;
}

/**
 * Bundles the toolbar action handlers for the active page. Undo/Redo prefer the
 * per-page (element) history; when none is available they fall back to the
 * page-array history (restores deleted/duplicated/moved pages).
 */
export function useToolbarHandlers({
  canvasRefsRef,
  currentPageIndex,
  toolbarState,
  canUndoPageOp,
  canRedoPageOp,
  undoPageOp,
  redoPageOp,
}: UseToolbarHandlersParams) {
  return useMemo(() => {
    const ref = canvasRefsRef.current[currentPageIndex];
    return {
      undo: () => {
        if (toolbarState?.canUndo) {
          ref?.current?.undo?.();
        } else if (canUndoPageOp) {
          undoPageOp();
        }
      },
      redo: () => {
        if (toolbarState?.canRedo) {
          ref?.current?.redo?.();
        } else if (canRedoPageOp) {
          redoPageOp();
        }
      },
      handleMoveLayer: (direction: 'up' | 'down') => ref?.current?.handleMoveLayer?.(direction),
      handleColorSelect: (color: string) => ref?.current?.handleColorSelect?.(color),
      handleOpacityChange: (id: string, opacity: number, type: string) =>
        ref?.current?.handleOpacityChange?.(id, opacity, type),
      handleFontSizeChange: (id: string, size: number) =>
        ref?.current?.handleFontSizeChange?.(id, size),
      handleAlign: (direction: AlignmentDirection) => ref?.current?.handleAlign?.(direction),
      handleShadowChange: (id: string, patch: ShadowPatch, type: string) =>
        ref?.current?.handleShadowChange?.(id, patch, type),
      handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) =>
        ref?.current?.handleOutlineChange?.(id, patch),
      handleBlurChange: (id: string, blur: number) => ref?.current?.handleBlurChange?.(id, blur),
      handleGradientSelect: (gradient: GradientFill | null) =>
        ref?.current?.handleGradientSelect?.(gradient),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasRefsRef,
    currentPageIndex,
    toolbarState?.canUndo,
    toolbarState?.canRedo,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
  ]);
}
