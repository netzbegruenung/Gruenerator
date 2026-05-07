import { AIExtension } from '@blocknote/xl-ai';

import { useEditorStore } from '../stores/editorStore';

/**
 * Programmatically trigger BlockNote's AI extension for a given document. Used
 * by the docs-chat surface to dispatch `trigger_doc_edit` SSE events from the
 * chat backend into the same pipeline that the editor's AI slash menu / toolbar
 * uses (POST /api/docs/ai → applyDocumentOperations → Yjs sync).
 *
 * Returns false if no editor is mounted for the given documentId or the
 * extension isn't registered (defensive: the editor decides whether AI is
 * available — chat shouldn't crash if the user closes the doc mid-stream).
 */
export async function invokeDocumentAI(opts: {
  documentId: string;
  userPrompt: string;
  useSelection?: boolean;
  // Prior chat assistant content the user references with "dies"/"das"/
  // "im dokument einfügen". Forwarded via chatRequestOptions.body so the
  // /api/docs/ai route can surface it in the system prompt as labeled
  // instructional context (NOT mixed into userPrompt — that confused the
  // model into inserting it verbatim).
  referenceContent?: string;
}): Promise<boolean> {
  const editor = useEditorStore.getState().getEditor(opts.documentId);
  if (!editor) return false;

  // BlockNote's `getExtension` lookup at runtime is loosely typed because
  // extension registration is dynamic; the cast names the trust boundary.
  const ext = (
    editor as unknown as {
      getExtension?: (factory: typeof AIExtension) => {
        invokeAI: (o: {
          userPrompt: string;
          useSelection?: boolean;
          chatRequestOptions?: { body?: object };
        }) => Promise<void>;
        openAIMenuAtBlock: (blockId: string) => void;
      } | null;
    }
  ).getExtension?.(AIExtension);
  if (!ext) return false;

  // Open the AI menu at an anchor block BEFORE invoking. This sets
  // `aiMenuState !== "closed"` so AIMenuController renders the popover that
  // hosts the Accept/Reject buttons once invokeAI transitions the status to
  // "user-reviewing". Without this call the same diff overlay still appears
  // (BlockNote applies edits as ProseMirror suggestions either way), but the
  // review buttons stay invisible — that's the asymmetry vs. the slash-menu
  // path, which calls openAIMenuAtBlock first.
  //
  // Anchor: cursor block if focused, else last block of the document (where
  // appended content lands). Mirrors the slash-menu's `cursor.block.id`
  // pattern when the user IS focused; degrades sensibly when they aren't.
  const editorTyped = editor as unknown as {
    getTextCursorPosition?: () => { block?: { id?: string } } | null;
    document?: ReadonlyArray<{ id?: string }>;
  };
  const cursorBlockId = editorTyped.getTextCursorPosition?.()?.block?.id;
  const lastBlockId = editorTyped.document?.[editorTyped.document.length - 1]?.id;
  const anchorBlockId = cursorBlockId ?? lastBlockId;
  if (anchorBlockId) {
    ext.openAIMenuAtBlock(anchorBlockId);
  }

  await ext.invokeAI({
    userPrompt: opts.userPrompt,
    useSelection: opts.useSelection ?? false,
    ...(opts.referenceContent
      ? { chatRequestOptions: { body: { referenceContent: opts.referenceContent } } }
      : {}),
  });
  return true;
}
