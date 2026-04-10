import { useEffect, useCallback, useRef } from 'react';

import { useHistoryStore } from '../stores/historyStore';

interface KeyboardShortcutActions {
  onPlayPause?: () => void;
  onSeekForward?: (seconds: number) => void;
  onSeekBackward?: (seconds: number) => void;
  onToggleFindReplace?: () => void;
  onSave?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const isMeta = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd shortcuts work even in inputs
      if (isMeta) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            return;
          case 'f':
            e.preventDefault();
            actionsRef.current.onToggleFindReplace?.();
            return;
          case 's':
            e.preventDefault();
            actionsRef.current.onSave?.();
            return;
        }
      }

      // Non-input shortcuts — skip when typing in fields
      if (isInput) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          actionsRef.current.onPlayPause?.();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          actionsRef.current.onSeekBackward?.(5);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          actionsRef.current.onSeekForward?.(5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          actionsRef.current.onSeekBackward?.(1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          actionsRef.current.onSeekForward?.(1);
          break;
        case '?':
          e.preventDefault();
          actionsRef.current.onShowHelp?.();
          break;
      }
    },
    [undo, redo]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
