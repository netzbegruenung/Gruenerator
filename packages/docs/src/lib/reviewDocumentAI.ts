import { useEditorStore } from '../stores/editorStore';
import { getDocAIExtension, isDocAIForked } from './aiExtension';

/**
 * Accept the pending AI suggestions for a document. Public counterpart to the
 * web AI popover's Accept button — used by the native review bar on mobile,
 * where the web popover is suppressed. `acceptChanges` self-contains cleanup
 * (it calls closeAIMenu internally) and works even though the menu was never
 * opened. Returns false if no editor/extension is mounted (defensive).
 *
 * The reported bug — "I merge an AI change, I see it, but collaborators don't" —
 * is a broadcast failure: BlockNote's `acceptChanges()` merges the AI fork back
 * into a Y.Doc, but that change only reaches collaborators if it lands on the
 * doc the websocket provider is actually syncing and is flushed onto the wire.
 * We therefore (1) watch the live doc to confirm the merge produced a
 * broadcastable update on it, and (2) force a sync so any locally-applied but
 * unsent update is pushed before the user can navigate away.
 */
export function acceptDocumentAI(documentId: string): boolean {
  const ext = getDocAIExtension(documentId);
  if (!ext) return false;

  const { provider, ydoc } = useEditorStore.getState().getDocContext(documentId) ?? {
    provider: null,
    ydoc: null,
  };

  const wasForked = isDocAIForked(documentId);
  const unsyncedBefore = provider?.unsyncedChanges ?? null;

  // Watch the *live* doc the provider syncs. If the merge produces no update
  // here, the accepted change was written to a different (stale/forked) Y.Doc
  // and will never reach collaborators.
  let liveDocUpdated = false;
  const onUpdate = () => {
    liveDocUpdated = true;
  };
  ydoc?.on('update', onUpdate);

  try {
    ext.acceptChanges();
  } finally {
    ydoc?.off('update', onUpdate);
  }

  const stillForked = isDocAIForked(documentId);
  const sameDoc = provider && ydoc ? provider.document === ydoc : null;

  if (wasForked && ydoc && provider && !liveDocUpdated) {
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

  return true;
}

/**
 * Reject the pending AI suggestions for a document. See {@link acceptDocumentAI}.
 */
export function rejectDocumentAI(documentId: string): boolean {
  const ext = getDocAIExtension(documentId);
  if (!ext) return false;
  ext.rejectChanges();
  return true;
}
