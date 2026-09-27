import { AIExtension } from '@blocknote/xl-ai';
import { ForkYDocExtension } from '@blocknote/core/yjs';

import { useEditorStore } from '../stores/editorStore';

/**
 * Single trust boundary for the docs AI surface.
 *
 * BlockNote's `editor.getExtension(...)` lookup is loosely typed because
 * extension registration is dynamic. Rather than re-cast the shape at every
 * call site (invokeDocumentAI / reviewDocumentAI / the pending-state hook),
 * this module names what we rely on once and resolves it from the editor store.
 */
export interface DocAIExtension {
  invokeAI: (o: {
    userPrompt: string;
    useSelection?: boolean;
    chatRequestOptions?: { body?: object };
  }) => Promise<void>;
  acceptChanges: () => void;
  rejectChanges: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorWithExtensions = { getExtension?: (factory: any) => unknown };

/** The xl-ai extension for a document's mounted editor, or null. */
export function getDocAIExtension(documentId: string): DocAIExtension | null {
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!editor) return null;
  const ext = (editor as unknown as EditorWithExtensions).getExtension?.(AIExtension);
  return (ext as DocAIExtension | undefined) ?? null;
}

/**
 * BlockNote's collaboration fork store. `isForked` is true between `fork()` (AI
 * invoke) and `merge()` (accept/reject) — i.e. while AI suggestions are pending
 * review and held in a detached Y.Doc that does not sync.
 *
 * Declared once here, like the AI extension above: four call sites read this
 * store (this file, usePendingDocAI, useDocAIReviewState, disableGcOnAIFork),
 * and a BlockNote upgrade that moves it should mean one edit, not four.
 */
export type DocForkStore = {
  state?: { isForked?: boolean };
  subscribe?: (listener: () => void) => () => void;
};

/** The fork store of a mounted editor, or null (non-collaborative surfaces). */
export function getDocForkStore(editor: unknown): DocForkStore | null {
  if (!editor) return null;
  const fork = (editor as EditorWithExtensions).getExtension?.(ForkYDocExtension) as
    { store?: DocForkStore } | undefined;
  return fork?.store ?? null;
}

/** Whether AI suggestions are pending review (forked) for a document. */
export function isDocAIForked(documentId: string): boolean {
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!editor) return false;
  return getDocForkStore(editor)?.state?.isForked ?? false;
}

/**
 * The xl-ai extension's own store. `aiMenuState` is `'closed'` unless the user
 * opened the AI popover (toolbar / slash menu) — chat-triggered invocations
 * never open it. Both this and the fork store come from BlockNote's
 * `createStore` and share the same `state`/`subscribe` API.
 */
export type DocAIMenuStore = {
  state?: { aiMenuState?: unknown };
  subscribe?: (listener: () => void) => () => void;
};

export function getDocAIMenuStore(editor: unknown): DocAIMenuStore | null {
  if (!editor) return null;
  const ext = (editor as EditorWithExtensions).getExtension?.(AIExtension) as
    { store?: DocAIMenuStore } | undefined;
  return ext?.store ?? null;
}
