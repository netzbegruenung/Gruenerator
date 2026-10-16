import { useCallback, useSyncExternalStore } from 'react';

import { getDocForkStore, getDocVersioningStore, isAIReviewFork } from '../lib/aiExtension';

/**
 * Reactive view of whether AI suggestions are pending review for an editor.
 *
 * BlockNote's AI flow forks the Y.Doc on invoke and only merges back into the
 * synced doc on accept/reject. While forked, the changes live in a detached doc
 * that does not sync — so leaving the page mid-review silently loses them. This
 * hook surfaces that state (`ForkYDocExtension`'s `isForked`) so the page can
 * guard navigation until the user accepts or rejects.
 *
 * Pass the BlockNote editor instance; returns `false` until one is mounted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = { getExtension?: (factory: any) => unknown } | null | undefined;

export function usePendingDocAI(editor: EditorLike): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubs = [getDocForkStore(editor), getDocVersioningStore(editor)].flatMap((store) =>
        store?.subscribe ? [store.subscribe(onChange)] : []
      );
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    [editor]
  );

  // A version preview is a fork too, but nothing in it is lost on leaving.
  const getSnapshot = useCallback(() => isAIReviewFork(editor), [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
