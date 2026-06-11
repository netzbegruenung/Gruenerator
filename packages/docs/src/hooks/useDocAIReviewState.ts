import { useCallback, useSyncExternalStore } from 'react';
import { ForkYDocExtension } from '@blocknote/core/extensions';

import { getDocAIMenuStore } from '../lib/aiExtension';
import { isDocAIInvocationInFlight, subscribeDocAIInFlight } from '../lib/invokeDocumentAI';

/**
 * Review state for AI suggestions that were applied without opening the AI
 * popover — i.e. chat-triggered edits via {@link invokeDocumentAI}.
 *
 * - `isPendingReview`: the doc is forked AND the AI menu is closed. When the
 *   user invokes AI through the toolbar/slash menu, BlockNote's own popover
 *   hosts Accept/Reject, so external review UI must stay hidden.
 * - `isStreaming`: an invocation is still writing into the fork. Accept/reject
 *   must be blocked during this window — with the menu closed the extension's
 *   abort is a no-op, and merging mid-stream would let the rest of the stream
 *   land in the live doc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = { getExtension?: (factory: any) => unknown } | null | undefined;
type ForkStore = {
  store?: {
    state?: { isForked?: boolean };
    subscribe?: (listener: () => void) => () => void;
  };
};

function getForkStore(editor: EditorLike): ForkStore['store'] | null {
  if (!editor) return null;
  const fork = editor.getExtension?.(ForkYDocExtension) as ForkStore | undefined;
  return fork?.store ?? null;
}

export interface DocAIReviewState {
  isPendingReview: boolean;
  isStreaming: boolean;
}

export function useDocAIReviewState(editor: EditorLike, documentId: string): DocAIReviewState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubs = [subscribeDocAIInFlight(onChange)];
      const forkStore = getForkStore(editor);
      if (forkStore?.subscribe) unsubs.push(forkStore.subscribe(onChange));
      const menuStore = getDocAIMenuStore(editor);
      if (menuStore?.subscribe) unsubs.push(menuStore.subscribe(onChange));
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    [editor]
  );

  const isForked = useSyncExternalStore(
    subscribe,
    useCallback(() => getForkStore(editor)?.state?.isForked ?? false, [editor])
  );
  const menuOpen = useSyncExternalStore(
    subscribe,
    useCallback(() => {
      const state = getDocAIMenuStore(editor)?.state?.aiMenuState;
      return state !== undefined && state !== 'closed';
    }, [editor])
  );
  const isStreaming = useSyncExternalStore(
    subscribe,
    useCallback(() => isDocAIInvocationInFlight(documentId), [documentId])
  );

  return { isPendingReview: isForked && !menuOpen, isStreaming };
}
