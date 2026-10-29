import {
  getDocAIExtension,
  getDocForkStore,
  hasDocAISuggestions,
  isDocAIForked,
} from './aiExtension';
import { isOwnAIReviewFork, rejectDocumentAI, rememberAIReviewFork } from './reviewDocumentAI';
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

// Outcome of the latest /api/docs/ai request per document. xl-ai keeps the
// request result to itself: with the AI menu closed (chat-triggered edits),
// `setAIResponseStatus` returns early, so not even its error state is set and
// `invokeAI` resolves the same way for a 500 as for a success. The transport's
// fetch reports here instead (BlockNoteEditor.tsx).
type DocAIResponse = number | 'network';
const lastResponse = new Map<string, DocAIResponse>();

/** Called by the AI transport for every /api/docs/ai response (or network failure). */
export function noteDocAIResponse(documentId: string, response: DocAIResponse): void {
  lastResponse.set(documentId, response);
}

function failureMessage(response: DocAIResponse | undefined): string | null {
  if (response === undefined || (typeof response === 'number' && response < 400)) return null;
  if (response === 401 || response === 403)
    return 'Keine Berechtigung für die KI-Bearbeitung dieses Dokuments.';
  if (response === 429) return 'Zu viele KI-Anfragen. Bitte kurz warten und erneut versuchen.';
  return 'Die KI-Bearbeitung ist fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * After the stream: an empty review would show accept/reject over nothing (and
 * accepting it used to raise a false sync alarm), so it is closed. The person
 * learns why — the chat has already announced the edit by then.
 */
function settleOutcome(documentId: string): void {
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!editor) return;
  const failure = failureMessage(lastResponse.get(documentId));
  const hasSuggestions = hasDocAISuggestions(editor);
  // Only a review our invocation opened is ours to close; an empty run inside
  // someone else's fork (version preview) leaves that fork alone.
  if (!hasSuggestions && isOwnAIReviewFork(documentId)) rejectDocumentAI(documentId);
  if (failure) {
    void import('sonner').then(({ toast }) => toast.error(failure));
  } else if (!hasSuggestions) {
    void import('sonner').then(({ toast }) =>
      toast.info('Die KI hat keine Änderung am Dokument vorgeschlagen.')
    );
  }
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
  // This is one half of a two-way lock: the other half (useSuggestionMode.toggle)
  // refuses to enable the mode while an AI review is forked. The mode flag lives
  // in the ydoc, so a null ydoc here means the mode cannot be on — safe to skip.
  const ydoc = useEditorStore.getState().getDocContext(opts.documentId)?.ydoc;
  if (ydoc && isSuggestionModeEnabled(ydoc)) {
    void import('sonner').then(({ toast }) =>
      toast.error(
        'KI-Bearbeitung ist im Änderungsmodus nicht verfügbar. Änderungsmodus zuerst beenden.'
      )
    );
    return false;
  }

  // NOTE: we deliberately do NOT call `openAIMenuAtBlock`. BlockNote's AI
  // popover (which hosts the Accept/Reject buttons) would lock the editor; the
  // review UX is the web DocAiReviewBar → accept/rejectDocumentAI.
  // `invokeAI` still applies the diff as ProseMirror suggestions regardless of
  // menu state — the suggestion plugin is independent of the menu.
  // The raw fork state, not isDocAIForked: that one reads false while the
  // version preview holds the fork, which would let this run claim (and later
  // merge back) a fork that shows an old version.
  const editor = useEditorStore.getState().getEditor(opts.documentId);
  const forkedBefore = getDocForkStore(editor)?.state?.isForked ?? false;
  // A fork that is not an AI review is the version preview. `fork()` would be a
  // no-op, so the suggestions would land in the preview and vanish on close.
  if (forkedBefore && !isDocAIForked(opts.documentId)) {
    void import('sonner').then(({ toast }) =>
      toast.error('Bitte zuerst die Versionshistorie schließen, dann erneut versuchen.')
    );
    return true;
  }
  lastResponse.delete(opts.documentId);
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
    // invokeAI opens the fork; if it was not open before, it is this review's.
    if (!forkedBefore) rememberAIReviewFork(opts.documentId);
    inFlight.delete(opts.documentId);
    notifyInFlight();
  }
  settleOutcome(opts.documentId);
  return true;
}
