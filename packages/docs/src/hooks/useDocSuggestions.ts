import { useEffect, useState } from 'react';
import type { BlockNoteEditor } from '@blocknote/core';
import type * as Y from 'yjs';

import {
  collectSuggestions,
  observeSuggestionMeta,
  type DocSuggestion,
} from '../lib/suggestionMode';

interface UseDocSuggestionsResult {
  suggestions: DocSuggestion[];
  count: number;
}

/**
 * Reactive list of open track-changes suggestions in the document. Recomputes
 * (debounced) on editor content changes — including remote ones, so collaborators'
 * suggestions appear — and on suggestion-metadata changes.
 *
 * Runs an O(doc) scan, so mount it only where the full list is needed (the
 * suggestions sidebar, which is only open when the feature is active). For a
 * cheap badge count use `suggestionMetaCount` + `observeSuggestionMeta` instead.
 */
export function useDocSuggestions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any> | null,
  ydoc: Y.Doc | null | undefined
): UseDocSuggestionsResult {
  const [suggestions, setSuggestions] = useState<DocSuggestion[]>([]);

  useEffect(() => {
    if (!editor || !ydoc) {
      setSuggestions([]);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => {
      const view = editor.prosemirrorView;
      if (!view) return;
      setSuggestions(collectSuggestions(view.state.doc, ydoc));
    };
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, 250);
    };

    const unsubEditor = editor.onChange(debounced);
    const unsubMeta = observeSuggestionMeta(ydoc, debounced);
    recompute();

    return () => {
      if (timer) clearTimeout(timer);
      unsubEditor?.();
      unsubMeta();
    };
  }, [editor, ydoc]);

  return { suggestions, count: suggestions.length };
}
