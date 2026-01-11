import { useEffect } from 'react';
import useImageStudioStore from '../../../stores/imageStudioStore';

/**
 * Hook for AI Editor history management with keyboard shortcuts
 * Provides undo/redo functionality with Ctrl+Z / Ctrl+Shift+Z shortcuts
 */
export const useAiEditorHistory = () => {
  const {
    undoAiGeneration,
    redoAiGeneration,
    canUndoAi,
    canRedoAi
  } = useImageStudioStore();

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Mac or Windows/Linux
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey && canUndoAi()) {
        e.preventDefault();
        undoAiGeneration();
      }

      // Redo: Ctrl/Cmd + Shift + Z
      if (cmdOrCtrl && e.shiftKey && e.key === 'z' && canRedoAi()) {
        e.preventDefault();
        redoAiGeneration();
      }

      // Alternative redo: Ctrl/Cmd + Y
      if (cmdOrCtrl && e.key === 'y' && canRedoAi()) {
        e.preventDefault();
        redoAiGeneration();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoAiGeneration, redoAiGeneration, canUndoAi, canRedoAi]);

  return {
    undo: undoAiGeneration,
    redo: redoAiGeneration,
    canUndo: canUndoAi,
    canRedo: canRedoAi
  };
};

export default useAiEditorHistory;
