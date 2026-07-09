import { getDocAIExtension } from './aiExtension';
import { isSuggestionModeEnabled } from './suggestionMode';
import { useEditorStore } from '../stores/editorStore';

// In-flight invocation registry. The fork store flips `isForked` at fork time —
// before the LLM streams — and with the AI menu closed the extension's own
// status/abort APIs are no-ops, so review UIs need an independent signal to
// know streaming is still in progress (accept/reject mid-stream would merge or
// discard a fork the stream keeps writing into).
const inFlight = new Set<string>();
const inFlightListeners = new Set<() => void>();

function notifyInFlight() {
  for (const cb of inFlightListeners) cb();
}

/** Whether an AI invocation is currently streaming for a document. */
export function isDocAIInvocationInFlight(documentId: string): boolean {
  return inFlight.has(documentId);
}

/** Subscribe to in-flight changes (useSyncExternalStore-compatible). */
export function subscribeDocAIInFlight(cb: () => void): () => void {
  inFlightListeners.add(cb);
  return () => {
    inFlightListeners.delete(cb);
  };
}

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

  // Track changes and AI editing share the same suggestion marks; running AI
  // while the mode is on would let its accept-all swallow human suggestions.
  const ydoc = useEditorStore.getState().getDocContext(opts.documentId)?.ydoc;
  if (ydoc && isSuggestionModeEnabled(ydoc)) {
    void import('sonner').then(({ toast }) =>
      toast.error(
        'KI-Bearbeitung ist im Änderungsmodus nicht verfügbar. Änderungsmodus zuerst beenden.'
      )
    );
    return false;
  }

  // NOTE: we deliberately do NOT call `openAIMenuAtBlock`. On mobile the web AI
  // popover (which hosts the Accept/Reject buttons) is suppressed entirely; the
  // review UX is rendered natively (DocAiReviewBar → accept/rejectDocumentAI).
  // `invokeAI` still applies the diff as ProseMirror suggestions regardless of
  // menu state — the suggestion plugin is independent of the menu.
  inFlight.add(opts.documentId);
  notifyInFlight();
  try {
    // invokeAI resolves only after the response stream completes, so the
    // in-flight window covers the whole fork-and-stream phase.
    await ext.invokeAI({
      userPrompt: opts.userPrompt,
      useSelection: opts.useSelection ?? false,
      ...(opts.referenceContent
        ? { chatRequestOptions: { body: { referenceContent: opts.referenceContent } } }
        : {}),
    });
  } finally {
    inFlight.delete(opts.documentId);
    notifyInFlight();
  }
  return true;
}
