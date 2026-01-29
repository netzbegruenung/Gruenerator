import { useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { useAiEditStore } from '../stores/aiEditStore';

export const useAiEditHistory = (documentId: string, editor: Editor | null) => {
  const { undo, redo, canUndo, canRedo, getHistory, getCurrentIndex, jumpToHistory } =
    useAiEditStore();

  const history = getHistory(documentId);
  const currentIndex = getCurrentIndex(documentId);
  const canUndoEdit = canUndo(documentId);
  const canRedoEdit = canRedo(documentId);

  const undoAiEdit = useCallback(() => {
    if (!editor || !canUndoEdit) return;

    const entries = history;
    const index = currentIndex;

    if (index > 0) {
      const prevEntry = entries[index - 1];
      // Restore snapshot
      editor.commands.setContent(prevEntry.afterContent);
      undo(documentId);
    }
  }, [editor, documentId, canUndoEdit, history, currentIndex, undo]);

  const redoAiEdit = useCallback(() => {
    if (!editor || !canRedoEdit) return;

    const entries = history;
    const index = currentIndex;

    if (index < entries.length - 1) {
      const nextEntry = entries[index + 1];
      // Restore snapshot
      editor.commands.setContent(nextEntry.afterContent);
      redo(documentId);
    }
  }, [editor, documentId, canRedoEdit, history, currentIndex, redo]);

  const jumpTo = useCallback(
    (index: number) => {
      if (!editor || index < 0 || index >= history.length) return;

      const entry = history[index];
      editor.commands.setContent(entry.afterContent);
      jumpToHistory(documentId, index);
    },
    [editor, documentId, history, jumpToHistory]
  );

  // Keyboard shortcuts (Ctrl+Alt+Z for AI undo to avoid conflict with Y.js)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + Alt + Z: AI Undo
      if (cmdOrCtrl && e.altKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoAiEdit();
      }

      // Ctrl/Cmd + Alt + Y: AI Redo
      if (cmdOrCtrl && e.altKey && e.key === 'y') {
        e.preventDefault();
        redoAiEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoAiEdit, redoAiEdit]);

  return {
    undoAiEdit,
    redoAiEdit,
    jumpTo,
    canUndo: canUndoEdit,
    canRedo: canRedoEdit,
    history,
    currentIndex,
  };
};
