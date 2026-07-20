import { useCallback, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';

import { isDocAIForked } from '../lib/aiExtension';
import {
  isSuggestionModeEnabled,
  observeSuggestionMode,
  setSuggestionMode,
} from '../lib/suggestionMode';

interface UseSuggestionModeResult {
  enabled: boolean;
  toggle: () => void;
}

const noopSubscribe = () => () => {};

/**
 * Doc-wide track-changes flag, synced via the Y.Doc `meta` map. Any editor
 * toggling it flips the mode for everyone (Word semantics). Toggling on is
 * refused while AI suggestions are pending review — the two share the same
 * suggestion marks and would corrupt each other's accept/reject.
 */
export function useSuggestionMode(
  ydoc: Y.Doc | null | undefined,
  documentId: string
): UseSuggestionModeResult {
  const enabled = useSyncExternalStore(
    useCallback(
      (cb: () => void) => (ydoc ? observeSuggestionMode(ydoc, cb) : noopSubscribe()),
      [ydoc]
    ),
    () => (ydoc ? isSuggestionModeEnabled(ydoc) : false),
    () => false
  );

  const toggle = useCallback(() => {
    if (!ydoc) return;
    const next = !isSuggestionModeEnabled(ydoc);
    if (next && isDocAIForked(documentId)) {
      toast.error('Änderungsmodus während einer KI-Überprüfung nicht verfügbar.');
      return;
    }
    setSuggestionMode(ydoc, next);
  }, [ydoc, documentId]);

  return { enabled, toggle };
}
