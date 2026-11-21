import { useEffect } from 'react';

import { useEditorStore, SECTION_ORDER, type EditorSelection } from '../stores/editorStore';

const isSection = (id: string | null): id is EditorSelection['section'] =>
  id !== null && (SECTION_ORDER as string[]).includes(id);

/** The selection a click or focus on `target` inside the page stands for; null outside sections. */
export function selectionAt(target: Element | null): EditorSelection | null {
  const section = target?.closest?.('[data-section]')?.getAttribute('data-section') ?? null;
  if (!isSection(section)) return null;
  const path = target?.closest?.('[data-field]')?.getAttribute('data-field') ?? null;
  const card =
    section === 'themes' || section === 'actions'
      ? target?.closest?.('[data-index]')?.getAttribute('data-index')
      : null;
  return { section, path, index: card != null ? Number(card) : null };
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

/** Outlines the selected section and the highlighted field inside the page. */
export function usePreviewHighlight(doc: Document | null): void {
  const section = useEditorStore((s) => s.selection?.section ?? null);
  const index = useEditorStore((s) => s.selection?.index ?? null);
  const path = useEditorStore((s) => s.highlightedElement?.path ?? s.selection?.path ?? null);
  useEffect(() => {
    if (!doc) return;
    const apply = () => {
      for (const element of doc.querySelectorAll('[data-section]')) {
        element.toggleAttribute(
          'data-editor-selected',
          element.getAttribute('data-section') === section
        );
      }
      for (const element of doc.querySelectorAll('[data-section] [data-index]')) {
        element.toggleAttribute(
          'data-editor-selected',
          index !== null &&
            element.closest('[data-section]')?.getAttribute('data-section') === section &&
            element.getAttribute('data-index') === String(index)
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
    // Sections and fields re-render with every draft change; keep the marks on the new nodes.
    const observer = new MutationObserver(apply);
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [doc, section, index, path]);
}
