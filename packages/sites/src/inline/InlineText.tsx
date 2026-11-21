import { useLayoutEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from 'react';

import { useDraft, useDraftActions, useDraftReader } from '../draft/SiteDraftContext';

import { blockTypeForPath, textBinding } from './fieldBindings';

/**
 * A plain-text field edited in place on the page. React never renders its text: the DOM holds
 * what the person types, and a draft value from elsewhere (undo, another tab, a collaborator) is
 * written in only while the field is not focused, so typing never fights the reconciler.
 */
export function InlineText({ path, placeholder }: { path: string; placeholder: string }) {
  const blockType = useDraft((d) => blockTypeForPath(path, d));
  const binding = useMemo(() => textBinding(path, blockType), [path, blockType]);
  const value = useDraft((d) => binding?.read(d) ?? '');
  const actions = useDraftActions();
  const readDraft = useDraftReader();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.ownerDocument.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  if (!binding) return null;

  const onInput = (event: FormEvent<HTMLSpanElement>) => {
    const el = event.currentTarget;
    const raw = (el.textContent ?? '').replace(/\s*\n\s*/g, ' ');
    const text = raw.slice(0, binding.maxLength);
    if (text !== el.textContent) {
      el.textContent = text;
      placeCaretAtEnd(el);
    }
    binding.write(actions, readDraft(), text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <span
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      aria-label={placeholder}
      data-inline-edit=""
      data-placeholder={placeholder}
      spellCheck
      onInput={onInput}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Trailing spaces are kept while typing (the next word follows), not in the draft.
        const trimmed = (event.currentTarget.textContent ?? '').trim();
        if (trimmed !== event.currentTarget.textContent) {
          event.currentTarget.textContent = trimmed;
          binding.write(actions, readDraft(), trimmed);
        }
      }}
    />
  );
}

function placeCaretAtEnd(el: HTMLElement) {
  const doc = el.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
