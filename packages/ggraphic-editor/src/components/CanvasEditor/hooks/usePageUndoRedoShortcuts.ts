// SPDX-License-Identifier: MPL-2.0
import { editorSkipsKey } from '@ggraphic/editor/utils/keyboardOwnership';
import { useEffect } from 'react';

/**
 * Markiert ein Overlay über dem Editor (Präsentationsmodus): Tasten aus ihm
 * lösen kein Seiten-Undo aus. Der Handler hier hört in der Capture-Phase auf
 * window und ist früher registriert als jedes Overlay — ein stopPropagation
 * des Overlays käme zu spät.
 */
export const EDITOR_KEY_SHIELD_ATTRIBUTE = 'data-canvas-key-shield';

interface UsePageUndoRedoShortcutsParams {
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
  activePageCanUndo,
  activePageCanRedo,
  canUndoPageOp,
  canRedoPageOp,
  undoPageOp,
  redoPageOp,
}: UsePageUndoRedoShortcutsParams): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editorSkipsKey(e)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`[${EDITOR_KEY_SHIELD_ATTRIBUTE}]`)) return;
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
  }, [activePageCanUndo, activePageCanRedo, canUndoPageOp, canRedoPageOp, undoPageOp, redoPageOp]);
}
