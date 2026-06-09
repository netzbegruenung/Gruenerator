import { getDocAIExtension } from './aiExtension';

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
  const ext = getDocAIExtension(opts.documentId);
  if (!ext) return false;

  // NOTE: we deliberately do NOT call `openAIMenuAtBlock`. On mobile the web AI
  // popover (which hosts the Accept/Reject buttons) is suppressed entirely; the
  // review UX is rendered natively (DocAiReviewBar → accept/rejectDocumentAI).
  // `invokeAI` still applies the diff as ProseMirror suggestions regardless of
  // menu state — the suggestion plugin is independent of the menu.
  await ext.invokeAI({
    userPrompt: opts.userPrompt,
    useSelection: opts.useSelection ?? false,
    ...(opts.referenceContent
      ? { chatRequestOptions: { body: { referenceContent: opts.referenceContent } } }
      : {}),
  });
  return true;
}
