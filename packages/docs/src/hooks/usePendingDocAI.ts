import { useCallback, useSyncExternalStore } from 'react';
import { ForkYDocExtension } from '@blocknote/core/extensions';

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

export function usePendingDocAI(editor: EditorLike): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const store = getForkStore(editor);
      if (!store?.subscribe) return () => {};
      return store.subscribe(onChange);
    },
    [editor]
  );

  const getSnapshot = useCallback(() => getForkStore(editor)?.state?.isForked ?? false, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
