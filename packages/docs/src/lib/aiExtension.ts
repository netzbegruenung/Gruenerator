import { AIExtension } from '@blocknote/xl-ai';
import { ForkYDocExtension } from '@blocknote/core/extensions';

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
 */
type ForkStore = { store?: { state?: { isForked?: boolean } } };

function getForkExtensionForEditor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
): ForkStore | null {
  const fork = (editor as EditorWithExtensions).getExtension?.(ForkYDocExtension);
  return (fork as ForkStore | undefined) ?? null;
}

/** Whether AI suggestions are pending review (forked) for a document. */
export function isDocAIForked(documentId: string): boolean {
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!editor) return false;
  return getForkExtensionForEditor(editor)?.store?.state?.isForked ?? false;
}
