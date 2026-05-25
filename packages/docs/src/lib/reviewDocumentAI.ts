import { AIExtension } from '@blocknote/xl-ai';

import { useEditorStore } from '../stores/editorStore';

// BlockNote's `getExtension` lookup at runtime is loosely typed because
// extension registration is dynamic; the cast names the trust boundary.
function getAIExtension(
  documentId: string
): { acceptChanges: () => void; rejectChanges: () => void } | null {
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!editor) return null;
  const ext = (
    editor as unknown as {
      getExtension?: (
        factory: typeof AIExtension
      ) => { acceptChanges: () => void; rejectChanges: () => void } | null;
    }
  ).getExtension?.(AIExtension);
  return ext ?? null;
}

/**
 * Accept the pending AI suggestions for a document. Public counterpart to the
 * web AI popover's Accept button — used by the native review bar on mobile,
 * where the web popover is suppressed. `acceptChanges` self-contains cleanup
 * (it calls closeAIMenu internally) and works even though the menu was never
 * opened. Returns false if no editor/extension is mounted (defensive).
 */
export function acceptDocumentAI(documentId: string): boolean {
  const ext = getAIExtension(documentId);
  if (!ext) return false;
  ext.acceptChanges();
  return true;
}

/**
 * Reject the pending AI suggestions for a document. See {@link acceptDocumentAI}.
 */
export function rejectDocumentAI(documentId: string): boolean {
  const ext = getAIExtension(documentId);
  if (!ext) return false;
  ext.rejectChanges();
  return true;
}
