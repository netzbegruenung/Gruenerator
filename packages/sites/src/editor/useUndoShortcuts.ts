import { useEffect } from 'react';

import { useDraftHistory } from '../draft/SiteDraftContext';

function isTextTarget(target: EventTarget | null): boolean {
  if (!target || !('tagName' in target)) return false;
  const el = target as HTMLElement;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

/**
 * ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y) over the whole draft, on `target` (the editor window, or the
 * canvas iframe's document: its key events do not reach the parent). A focused text field keeps
 * its own undo, so typing is undone letter-wise where the person is typing.
 */
export function useUndoShortcuts(target: Window | Document | null) {
  const { undo, redo } = useDraftHistory();
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: Event) => {
      const event = e as KeyboardEvent;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isTextTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      if (key !== 'z' && !isRedo) return;
      event.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [target, undo, redo]);
}
