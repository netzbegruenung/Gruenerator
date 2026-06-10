import { useEffect } from 'react';

interface UsePageUndoRedoShortcutsParams {
  isMobileBridge: boolean;
  activePageCanUndo: boolean;
  activePageCanRedo: boolean;
  canUndoPageOp: boolean;
  canRedoPageOp: boolean;
  undoPageOp: () => void;
  redoPageOp: () => void;
}

/**
 * Page-level undo/redo via capture-phase keydown. Runs BEFORE the per-page
 * useCanvasUndoRedo handlers so that when the active page has no element-level
 * undo available, Ctrl/Cmd+Z is routed to the page-array UndoManager (which
 * restores deleted/duplicated/moved pages). If the active page DOES have
 * element undo, the per-page handler takes it.
 */
export function usePageUndoRedoShortcuts({
  isMobileBridge,
  activePageCanUndo,
  activePageCanRedo,
  canUndoPageOp,
  canRedoPageOp,
  undoPageOp,
  redoPageOp,
}: UsePageUndoRedoShortcutsParams): void {
  useEffect(() => {
    if (isMobileBridge) return undefined;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (!modKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;

      if (isUndo && !activePageCanUndo && canUndoPageOp) {
        e.preventDefault();
        e.stopPropagation();
        undoPageOp();
      } else if (isRedo && !activePageCanRedo && canRedoPageOp) {
        e.preventDefault();
        e.stopPropagation();
        redoPageOp();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    isMobileBridge,
    activePageCanUndo,
    activePageCanRedo,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
  ]);
}
