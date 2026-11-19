import { useCallback, useEffect } from 'react';

import { useEditorStore, type EditorPanel, type FocusedField } from '../stores/editorStore';

type FieldElement = HTMLElement;

const fields = new Map<string, FieldElement>();
let handled: FocusedField | null = null;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resolveField(path: string): FieldElement | null {
  const exact = fields.get(path);
  if (exact) return exact;
  let best: string | null = null;
  for (const key of fields.keys()) {
    if (path.startsWith(`${key}.`) && (best === null || key.length > best.length)) best = key;
  }
  if (best !== null) return fields.get(best) ?? null;
  for (const [key, element] of fields) {
    if (key.startsWith(`${path}.`)) return element;
  }
  return null;
}

export function useFieldRegistry() {
  const focusedField = useEditorStore((s) => s.focusedField);
  const clearFocus = useEditorStore((s) => s.clearFocus);
  const setHighlightedElement = useEditorStore((s) => s.setHighlightedElement);

  const registerField = useCallback((path: string, element: FieldElement | null) => {
    if (element) fields.set(path, element);
    else fields.delete(path);
  }, []);

  useEffect(() => {
    if (!focusedField || handled === focusedField) return;
    const element = resolveField(focusedField.path);
    if (!element) return;
    handled = focusedField;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [focusedField]);

  const handleFieldFocus = useCallback(
    (panel: EditorPanel, path: string) => setHighlightedElement({ panel, path }),
    [setHighlightedElement]
  );

  const handleFieldBlur = useCallback(() => {
    setTimeout(() => {
      if (!document.activeElement?.closest('.section-editor-panel')) clearFocus();
    }, 100);
  }, [clearFocus]);

  return { registerField, handleFieldFocus, handleFieldBlur };
}
