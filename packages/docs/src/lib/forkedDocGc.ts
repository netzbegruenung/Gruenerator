import { ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';

import { getDocForkStore } from './aiExtension';

/**
 * Keep the positions xl-ai tracks during an AI edit resolvable.
 *
 * BlockNote forks the Y.Doc for the duration of an AI invocation, and the fork
 * is a plain `new Y.Doc()` (ForkYDocExtension) — i.e. with Yjs' default garbage
 * collection ON. For a selection-scoped edit, xl-ai anchors relative positions
 * to the selection boundaries (`trackPosition` in createUpdateBlockTool) and
 * re-resolves them on every streamed chunk. The AI's own edits delete the blocks
 * it rewrites; GC then drops those items at the end of the transaction, the
 * anchors become unresolvable, and `RelativePositionMapping` throws "Position
 * not found, cannot track positions" — aborting the edit mid-stream
 * (GlitchTip GRUENERATOR-F7).
 *
 * With GC off, the tombstones survive and the anchors keep resolving. The fork
 * lives only for the seconds between invoke and accept/reject and is discarded
 * afterwards, so nothing accumulates. The synced doc is never touched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = { getExtension?: (factory: any) => unknown; prosemirrorState?: unknown };

export interface ForkGcGuardOptions {
  /** The synced doc, so the guard can never flip GC on it. */
  syncedYdoc?: Y.Doc | null;
  /**
   * Whether the editor was created `withCollaboration` — i.e. whether a fork
   * extension is expected at all. Derived from the editor's collaboration
   * options, deliberately NOT from the presence of a `ydoc`: `useCollaboration`
   * hands out a placeholder `new Y.Doc()` before the provider exists, so a
   * truthy doc alone does not mean the Yjs extensions are attached, and the
   * drift warning below would fire on a perfectly healthy mount.
   */
  isCollaborative?: boolean;
}

/**
 * This guard reaches into BlockNote's fork store and y-prosemirror's plugin
 * state. If either moves — or upstream fixes the fork's GC itself — the guard
 * would go from "working" to "silently doing nothing", and the tests below
 * (which drive fakes) would stay green. So say it out loud instead: a lookup
 * that fails while a fork exists is drift, not a normal state.
 */
function createDriftWarner() {
  let warned = false;
  return (what: string) => {
    if (warned) return;
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[docs] AI fork GC guard inactive — ${what}. Tracked positions can be garbage collected mid-stream ("Position not found, cannot track positions"). Re-check disableGcOnAIFork against the installed @blocknote/core.`
    );
  };
}

/** The Y.Doc the editor's ySync plugin is currently bound to (the fork, while forked). */
function getBoundYDoc(editor: EditorLike): Y.Doc | null {
  // Boundary cast: y-prosemirror's PluginKey.getState wants a ProseMirror
  // EditorState we don't re-type across BlockNote's generic editor here — the
  // same reach-in as getDocUndoManager.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = ySyncPluginKey.getState(editor.prosemirrorState as any) as
    { doc?: Y.Doc } | undefined;
  return state?.doc ?? null;
}

/**
 * Disable garbage collection on the AI fork as soon as BlockNote creates it.
 * Returns an unsubscribe function; a no-op when the editor has no fork
 * extension (non-collaborative surfaces).
 */
export function disableGcOnAIFork(
  editor: EditorLike | null,
  { syncedYdoc = null, isCollaborative = false }: ForkGcGuardOptions = {}
): () => void {
  if (!editor) return () => {};
  // Once per editor mount: enough to be noticed, not enough to spam a session.
  const warnDrift = createDriftWarner();
  const store = getDocForkStore(editor);
  if (!store?.subscribe) {
    // Only a collaborative editor has a fork to guard; without one this is
    // correctly a no-op. With collaboration on, a missing store means the
    // extension moved — see createDriftWarner above.
    if (isCollaborative) {
      warnDrift('ForkYDocExtension exposes no subscribable store');
    }
    return () => {};
  }

  const applyToFork = () => {
    if (!store.state?.isForked) return;
    const forked = getBoundYDoc(editor);
    // `isForked` is set inside fork() after the plugins were swapped, so the
    // bound doc is the fork by now. The identity check is the backstop: if the
    // swap ever lands late, we'd rather leave GC alone than disable it on the
    // long-lived synced doc.
    if (!forked || forked === syncedYdoc) {
      warnDrift(
        forked
          ? 'forked but the ySync plugin still points at the synced doc'
          : 'forked but no Y.Doc could be read from the ySync plugin state'
      );
      return;
    }
    forked.gc = false;
  };

  // Cover an editor that mounts while a review is already forked.
  applyToFork();
  return store.subscribe(applyToFork);
}
