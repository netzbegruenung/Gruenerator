import { useMemo } from 'react';

import type { ShadowPatch } from '../../../hooks/useFloatingModuleHandlers';
import type { PageCommandId } from '../../../utils/canvasCommandRegistry';
import type { GradientFill } from '../../../utils/gradientFill';
import type { GenericCanvasRef, ToolbarStateReport } from '../../GenericCanvas';
import type React from 'react';

interface UseToolbarHandlersParams {
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  currentPageIndex: number;
  toolbarState: ToolbarStateReport | null;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
  undoPageOp: () => void;
  redoPageOp: () => void;
  discardReplaceDeck: () => void;
}

/**
 * Bundles the toolbar action handlers for the active page. Undo/Redo prefer the
 * per-page (element) history; when none is available they fall back to the
 * page-array history (restores deleted/duplicated/moved pages).
 *
 * The active page's handle is looked up inside each handler, at call time.
 * Reading `canvasRefsRef.current[currentPageIndex]` once while building the
 * memo froze whatever the array held on the first render: the React Compiler
 * treats a value derived from a ref as non-reactive and creates these closures
 * exactly once. In the collab editor the pages arrive after the first render,
 * so every handler except undo/redo called into `undefined` for the whole
 * session — the mobile selection bar and pill looked alive and did nothing.
 */
export function useToolbarHandlers({
  canvasRefsRef,
  currentPageIndex,
  toolbarState,
  canUndoPageOp,
  canRedoPageOp,
  undoPageOp,
  redoPageOp,
  discardReplaceDeck,
}: UseToolbarHandlersParams) {
  return useMemo(() => {
    const page = () => canvasRefsRef.current[currentPageIndex]?.current ?? null;
    return {
      undo: () => {
        if (toolbarState?.canUndo) {
          page()?.undo?.();
        } else if (canUndoPageOp) {
          undoPageOp();
        }
      },
      // The spec path replaced the whole deck in one page-level step; Verwerfen
      // takes it back for good, so Redo cannot re-apply it.
      undoPages: discardReplaceDeck,
      redo: () => {
        if (toolbarState?.canRedo) {
          page()?.redo?.();
        } else if (canRedoPageOp) {
          redoPageOp();
        }
      },
      handleMoveLayer: (direction: 'up' | 'down') => page()?.handleMoveLayer?.(direction),
      handleDuplicate: () => page()?.handleDuplicate?.(),
      handleDeleteElement: () => page()?.handleDeleteElement?.(),
      handleCopy: () => page()?.runCommand?.('copy', null),
      handleToggleLock: () => page()?.runCommand?.('toggleLock', null),
      handleSetRotation: (deg: number) => page()?.setRotation?.(deg),
      handlePreviewRotation: (deg: number) => page()?.previewRotation?.(deg),
      handleCommitRotationPreview: () => page()?.commitRotationPreview?.(),
      handleFlip: (axis: 'x' | 'y') =>
        page()?.runCommand?.(axis === 'x' ? 'flipHorizontal' : 'flipVertical', null),
      handleColorSelect: (color: string) => page()?.handleColorSelect?.(color),
      handleOpacityChange: (id: string, opacity: number, type: string) =>
        page()?.handleOpacityChange?.(id, opacity, type),
      handleFontSizeChange: (id: string, size: number) => page()?.handleFontSizeChange?.(id, size),
      runCommand: (id: PageCommandId) => page()?.runCommand?.(id, null),
      getGeometry: () => page()?.getGeometry?.() ?? null,
      handlePositionChange: (patch: { x?: number; y?: number }) => page()?.setPosition?.(patch),
      handleSizeChange: (patch: { width?: number; height?: number }) => page()?.setSize?.(patch),
      handleShadowChange: (id: string, patch: ShadowPatch, type: string) =>
        page()?.handleShadowChange?.(id, patch, type),
      handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) =>
        page()?.handleOutlineChange?.(id, patch),
      handleBlurChange: (id: string, blur: number) => page()?.handleBlurChange?.(id, blur),
      handleCropImage: () => page()?.handleCropImage?.(),
      handleGradientSelect: (gradient: GradientFill | null) =>
        page()?.handleGradientSelect?.(gradient),
    };
  }, [
    canvasRefsRef,
    currentPageIndex,
    toolbarState?.canUndo,
    toolbarState?.canRedo,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
    discardReplaceDeck,
  ]);
}
