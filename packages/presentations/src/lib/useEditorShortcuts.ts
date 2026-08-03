import { useEffect, useRef } from 'react';

export interface UseEditorShortcutsOptions {
  /** Suspends all shortcuts while another surface (present mode, a sheet,
   * a modal) is layered on top and owns the keys. */
  disabled?: boolean;
  editable: boolean;
  slideCount: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Editor keyboard shortcuts (PowerPoint/Google-Slides idiom): arrows and
 * PageUp/PageDown step through slides, Home/End jump, Ctrl/Cmd+Z and
 * Ctrl/Cmd+Shift+Z / Ctrl+Y drive the Yjs undo history.
 *
 * Document-level so no focus target is required — a focus-scoped handler would
 * go dead whenever focus sits on `body` or the top bar. Skipped while typing
 * (inputs, textareas, contentEditable) and while a dnd-kit keyboard drag owns
 * the arrow keys: the sortable handle registers its listener later than this
 * one, so `defaultPrevented` can't tell us and we check the handle's
 * `aria-roledescription` instead.
 *
 * The listener attaches once; changing options are read through a ref
 * (canvas-editor's `useCanvasKeyboardHandlers` pattern).
 */
export function useEditorShortcuts(options: UseEditorShortcutsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { disabled, editable, slideCount, activeIndex, onSelect, onUndo, onRedo } =
        optionsRef.current;
      if (disabled || e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase())) {
        if (!editable) return;
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod || e.altKey || slideCount === 0) return;
      if (target?.closest('[aria-roledescription="sortable"]')) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          onSelect(Math.max(0, activeIndex - 1));
          break;
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          onSelect(Math.min(slideCount - 1, activeIndex + 1));
          break;
        case 'Home':
          onSelect(0);
          break;
        case 'End':
          onSelect(slideCount - 1);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
