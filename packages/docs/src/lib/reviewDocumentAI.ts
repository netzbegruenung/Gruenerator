import { revertSuggestions } from '@handlewithcare/prosemirror-suggest-changes';
import { ySyncPluginKey } from 'y-prosemirror';

import { useEditorStore } from '../stores/editorStore';
import { getDocAIExtension, hasDocAISuggestions, isDocAIForked, mergeDocFork } from './aiExtension';

import type { EditorState, Transaction } from 'prosemirror-state';
import type { Doc, XmlFragment } from 'yjs';

/** The fragment ySync is bound to right now — the fork's while one is open. */
function boundFragment(state: EditorState): XmlFragment | null {
  return (ySyncPluginKey.getState(state) as { type?: XmlFragment } | undefined)?.type ?? null;
}

/**
 * Whether the fork, with the suggestions already reverted, still differs from
 * the live doc — i.e. holds the person's own edits. Its counterpart in the live
 * doc has the same root name.
 */
function forkDiffersFromLive(state: EditorState, liveDoc: Doc | null): boolean {
  const forked = boundFragment(state);
  if (!forked?.doc || !liveDoc || forked.doc === liveDoc) return false;
  for (const [name, type] of forked.doc.share) {
    if ((type as unknown) === forked)
      return liveDoc.getXmlFragment(name).toString() !== forked.toString();
  }
  return true;
}

// The forked Y.Doc each chat AI review runs in. ForkYDoc is shared: BlockNote
// 0.56's version preview forks the same way, and `fork()` is a no-op while a
// fork is open. Merging a fork back with `keepChanges: true` is only safe for a
// fork our own invocation opened — a version-preview fork holds an OLD version
// and would overwrite the live doc. Every fork is a new Y.Doc, so a stale entry
// can never match a later fork.
const aiReviewForks = new Map<string, Doc>();

/** Record the fork an AI invocation has just opened (see invokeDocumentAI). */
export function rememberAIReviewFork(documentId: string): void {
  const editor = useEditorStore.getState().getEditor(documentId);
  const forked = editor ? boundFragment(editor.prosemirrorState)?.doc : null;
  const ydoc = useEditorStore.getState().getDocContext(documentId)?.ydoc ?? null;
  if (forked && forked !== ydoc) aiReviewForks.set(documentId, forked);
}

/** Whether the open fork is one an AI invocation opened. */
export function isOwnAIReviewFork(documentId: string): boolean {
  const editor = useEditorStore.getState().getEditor(documentId);
  const remembered = aiReviewForks.get(documentId);
  return Boolean(
    editor && remembered && boundFragment(editor.prosemirrorState)?.doc === remembered
  );
}

/**
 * - 'merged': accepted and (as far as detectable) broadcast to collaborators
 * - 'not-broadcast': accepted locally, but the merge never landed on the live
 *   doc the provider syncs — collaborators will NOT see the change; callers
 *   must surface this to the user instead of silently closing the review UI
 * - 'no-extension': no editor/AI extension mounted for this document
 */
export type AcceptDocumentAIResult = 'merged' | 'not-broadcast' | 'no-extension';

/**
 * Accept the pending AI suggestions for a document. Public counterpart to the
 * web AI popover's Accept button — used by the native review bar on mobile,
 * where the web popover is suppressed. `acceptChanges` self-contains cleanup
 * (it calls closeAIMenu internally) and works even though the menu was never
 * opened.
 *
 * The reported bug — "I merge an AI change, I see it, but collaborators don't" —
 * is a broadcast failure: BlockNote's `acceptChanges()` merges the AI fork back
 * into a Y.Doc, but that change only reaches collaborators if it lands on the
 * doc the websocket provider is actually syncing and is flushed onto the wire.
 * We therefore (1) watch the live doc to confirm the merge produced a
 * broadcastable update on it, and (2) force a sync so any locally-applied but
 * unsent update is pushed before the user can navigate away.
 */
export function acceptDocumentAI(documentId: string): AcceptDocumentAIResult {
  const ext = getDocAIExtension(documentId);
  if (!ext) return 'no-extension';

  const { provider, ydoc } = useEditorStore.getState().getDocContext(documentId) ?? {
    provider: null,
    ydoc: null,
  };

  const wasForked = isDocAIForked(documentId);
  const editor = useEditorStore.getState().getEditor(documentId);
  // A review without suggestions has nothing to broadcast; no live update
  // then is expected, not a sync failure.
  const hadSuggestions = editor ? hasDocAISuggestions(editor) : true;
  const unsyncedBefore = provider?.unsyncedChanges ?? null;

  // Watch the *live* doc the provider syncs. If the merge produces no update
  // here, the accepted change was written to a different (stale/forked) Y.Doc
  // and will never reach collaborators.
  let liveDocUpdated = false;
  const onUpdate = () => {
    liveDocUpdated = true;
  };
  ydoc?.on('update', onUpdate);

  // Note on undoability: the plugin's own UndoManager cannot capture the AI
  // merge (ForkYDoc.merge() applies it under the editor origin, which
  // y-prosemirror does not track). guardDocUndoAcrossAIFork owns this instead:
  // a standalone capture manager on the original fragment records the merge
  // and hands it to the plugin manager, so accept IS one undo step (#3261).
  try {
    ext.acceptChanges();
  } finally {
    ydoc?.off('update', onUpdate);
    aiReviewForks.delete(documentId);
  }

  const stillForked = isDocAIForked(documentId);
  const sameDoc = provider && ydoc ? provider.document === ydoc : null;
  const notBroadcast = Boolean(wasForked && hadSuggestions && ydoc && provider && !liveDocUpdated);

  if (notBroadcast) {
    // eslint-disable-next-line no-console
    console.error(
      '[acceptDocumentAI] merge produced no update on the live doc — accepted change will NOT sync to collaborators',
      { documentId, wasForked, stillForked, sameDoc }
    );
  }

  // Belt-and-suspenders: push any locally-applied-but-unsent update before the
  // editor can be torn down by navigation.
  if (provider?.hasUnsyncedChanges) {
    provider.forceSync();
  }

  // eslint-disable-next-line no-console
  console.info('[acceptDocumentAI]', {
    documentId,
    wasForked,
    stillForked,
    liveDocUpdated,
    sameDoc,
    unsyncedBefore,
    unsyncedAfter: provider?.unsyncedChanges ?? null,
    synced: provider?.synced ?? null,
  });

  return notBroadcast ? 'not-broadcast' : 'merged';
}

/**
 * Reject the pending AI suggestions for a document. See {@link acceptDocumentAI}.
 *
 * xl-ai's own `rejectChanges` ends the fork with `keepChanges: false`, which
 * throws away the whole forked doc — including everything the person typed
 * while the suggestion was pending (the editor stays editable during a chat
 * review). Here only the suggestions are reverted, the same way upstream does
 * it, and the fork is then merged back with what is left: the person's own
 * edits. Without own edits the fork is discarded as upstream does: merging it
 * would only carry tombstones of the reverted AI text and leave an empty undo
 * step behind. A fork this module did not see an AI invocation open (a
 * version preview, the AI popover) gets exactly upstream's reject.
 */
export function rejectDocumentAI(documentId: string): boolean {
  const ext = getDocAIExtension(documentId);
  const editor = useEditorStore.getState().getEditor(documentId);
  if (!ext || !editor) return false;
  if (!isOwnAIReviewFork(documentId)) {
    aiReviewForks.delete(documentId);
    ext.rejectChanges();
    return true;
  }
  aiReviewForks.delete(documentId);
  editor.exec((state: EditorState, dispatch?: (tr: Transaction) => void) =>
    revertSuggestions(state, (tr) => {
      // Not an undo step: the last step stays the one before the AI call.
      dispatch?.(tr.setMeta('addToHistory', false));
    })
  );
  const { ydoc } = useEditorStore.getState().getDocContext(documentId) ?? { ydoc: null };
  mergeDocFork(editor, forkDiffersFromLive(editor.prosemirrorState, ydoc));
  ext.closeAIMenu();
  return true;
}
