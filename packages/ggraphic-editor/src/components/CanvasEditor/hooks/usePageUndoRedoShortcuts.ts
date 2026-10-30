// SPDX-License-Identifier: MPL-2.0
import { useEffect } from 'react';

import { type HistoryStamps, routeHistory } from '@ggraphic/editor/utils/historyStamp';
import { editorSkipsKey } from '@ggraphic/editor/utils/keyboardOwnership';

/**
 * Markiert ein Overlay über dem Editor (Präsentationsmodus): Tasten aus ihm
 * lösen kein Seiten-Undo aus. Der Handler hier hört in der Capture-Phase auf
 * window und ist früher registriert als jedes Overlay — ein stopPropagation
 * des Overlays käme zu spät.
 */
export const EDITOR_KEY_SHIELD_ATTRIBUTE = 'data-canvas-key-shield';

interface UsePageUndoRedoShortcutsParams {
  /** The active page's history stamps, read at key time; null without a mounted page. */
  activePageStamps: () => HistoryStamps | null;
  pageOpStamps: () => HistoryStamps;
  undoPageOp: () => void;
  redoPageOp: () => void;
}

/**
 * Page-level undo/redo via capture-phase keydown. Runs BEFORE the per-page
 * useCanvasUndoRedo handlers: when the newest step (Undo) or the oldest undone
 * one (Redo) is a page op or a replaced deck, Ctrl/Cmd+Z goes to the
 * page-array UndoManager and the page never hears the key. Otherwise the
 * per-page handler takes it (`utils/historyStamp`).
 */
export function usePageUndoRedoShortcuts({
  activePageStamps,
  pageOpStamps,
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

      if (routeHistory(isUndo ? 'undo' : 'redo', activePageStamps(), pageOpStamps()) !== 'pageOps')
        return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undoPageOp();
      else redoPageOp();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activePageStamps, pageOpStamps, undoPageOp, redoPageOp]);
}
