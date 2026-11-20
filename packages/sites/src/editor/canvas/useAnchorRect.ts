import { useEffect, useState } from 'react';

import { type EditorSelection } from '../../stores/editorStore';

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The element the toolbar points at: the clicked card, else the clicked field, else the section. */
export function anchorElement(doc: Document, selection: EditorSelection): Element | null {
  const section = doc.querySelector(`[data-section="${selection.section}"]`);
  if (!section) return null;
  if (selection.index !== null) {
    const card = section.querySelector(`[data-index="${selection.index}"]`);
    if (card) return card;
  }
  if (selection.path !== null) {
    const field = section.querySelector(`[data-field="${CSS.escape(selection.path)}"]`);
    if (field) return field;
  }
  return section;
}

/**
 * Where the anchor sits, in the coordinates of the frame's own box (the canvas the toolbar is
 * positioned in). Follows scrolling inside the frame, resizes and re-renders of the page.
 */
export function useAnchorRect(
  doc: Document | null,
  selection: EditorSelection | null
): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    const win = doc?.defaultView;
    if (!doc || !win || !selection) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const element = anchorElement(doc, selection);
      if (!element) {
        setRect(null);
        return;
      }
      const box = element.getBoundingClientRect();
      setRect((previous) =>
        previous &&
        previous.top === box.top &&
        previous.left === box.left &&
        previous.width === box.width &&
        previous.height === box.height
          ? previous
          : { top: box.top, left: box.left, width: box.width, height: box.height }
      );
    };
    const schedule = () => {
      if (!raf) raf = win.requestAnimationFrame(measure);
    };
    measure();
    win.addEventListener('scroll', schedule, { passive: true });
    win.addEventListener('resize', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    return () => {
      if (raf) win.cancelAnimationFrame(raf);
      win.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [doc, selection]);

  return rect;
}
