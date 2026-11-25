import { useEffect } from 'react';

import { useEditorStore, type EditorSelection } from '../stores/editorStore';

/** The selection a click or focus on `target` inside the page stands for; null outside blocks. */
export function selectionAt(target: Element | null): EditorSelection | null {
  const block = target?.closest?.('[data-block-id]');
  const blockId = block?.getAttribute('data-block-id') ?? null;
  if (!block || !blockId) return null;
  const path = target?.closest?.('[data-field]')?.getAttribute('data-field') ?? null;
  const item = target?.closest?.('[data-item-id]');
  // A card belongs to this block only if it sits inside it.
  const itemId = item && block.contains(item) ? item.getAttribute('data-item-id') : null;
  return { blockId, itemId, path };
}

/**
 * Clicking or tabbing into the page selects what is under it; the toolbar follows the selection.
 * Inline fields keep their own focus and caret, so nothing here prevents the default.
 */
export function usePreviewSelection(doc: Document | null): void {
  useEffect(() => {
    if (!doc) return;
    const select = (event: Event) => {
      useEditorStore.getState().select(selectionAt(event.target as Element | null));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = useEditorStore.getState();
      if (state.elementPanel) state.openElementPanel(null);
      else state.select(null);
    };
    doc.addEventListener('click', select);
    doc.addEventListener('focusin', select);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('click', select);
      doc.removeEventListener('focusin', select);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [doc]);
}

/** Outlines the selected block and card, and the highlighted field inside the page. */
export function usePreviewHighlight(doc: Document | null): void {
  const blockId = useEditorStore((s) => s.selection?.blockId ?? null);
  const itemId = useEditorStore((s) => s.selection?.itemId ?? null);
  const path = useEditorStore((s) => s.highlightedElement?.path ?? s.selection?.path ?? null);
  useEffect(() => {
    if (!doc) return;
    const apply = () => {
      for (const element of doc.querySelectorAll('[data-block-id]')) {
        element.toggleAttribute(
          'data-editor-selected',
          element.getAttribute('data-block-id') === blockId
        );
      }
      for (const element of doc.querySelectorAll('[data-block-id] [data-item-id]')) {
        element.toggleAttribute(
          'data-editor-selected',
          itemId !== null &&
            element.closest('[data-block-id]')?.getAttribute('data-block-id') === blockId &&
            element.getAttribute('data-item-id') === itemId
        );
      }
      for (const element of doc.querySelectorAll('[data-field]')) {
        element.toggleAttribute(
          'data-editor-active',
          path !== null && element.getAttribute('data-field') === path
        );
      }
    };
    apply();
    // Blocks and fields re-render with every draft change; keep the marks on the new nodes.
    const observer = new MutationObserver(apply);
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [doc, blockId, itemId, path]);
}

/**
 * Marks the block a new one from the picker would follow, so the canvas shows where it lands,
 * and scrolls it into view. The mark is a `data-editor-insert-after` label (EDITOR_FRAME_CSS).
 */
export function usePreviewInsertMark(doc: Document | null): void {
  const preview = useEditorStore((s) => s.insertPreview);
  useEffect(() => {
    if (!doc || !preview) return;
    const selector = `[data-block-id="${CSS.escape(preview.afterBlockId)}"]`;
    const block = doc.querySelector(selector);
    if (!block) return;
    block.setAttribute('data-editor-insert-after', preview.label);
    const reduce = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    block.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    return () => block.removeAttribute('data-editor-insert-after');
  }, [doc, preview]);
}
