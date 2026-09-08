import { YUndoExtension } from '@blocknote/core/yjs';

import { getDocForkStore } from './aiExtension';
import { getDocUndoManager, type UndoableEditor } from '../hooks/useDocUndoState';

/**
 * Keep undo/redo alive across BlockNote's AI fork/merge cycle.
 *
 * Every AI invocation forks the Y.Doc (ForkYDocExtension), and both fork() and
 * merge() swap the yjs plugins via `editor.replaceExtension`. ProseMirror's
 * `reconfigure` carries the yUndo plugin STATE over (the plugin key is the
 * module-singleton `yUndoPluginKey`, so the field survives) — the same
 * UndoManager instance stays in the state. But the plugin VIEWS are destroyed
 * and recreated, and y-prosemirror's undo-plugin view returns
 * `destroy: () => undoManager.destroy()`, which unhooks the manager from the
 * doc's `afterTransaction`. Net effect without this guard: from the first AI
 * invocation on, no edit is ever captured again — undo/redo is dead for the
 * rest of the editor session, while the stale pre-AI stack keeps the toolbar
 * buttons enabled and Cmd+Z applies pre-AI steps to the doc.
 *
 * The guard subscribes to the fork store and:
 * - on fork: blanks the (already dead) manager's stacks, so the review phase
 *   shows undo/redo as unavailable instead of applying stale steps to the
 *   HIDDEN original doc (invisible locally, but synced to collaborators);
 * - on merge: rebuilds the yUndo plugin so y-prosemirror's `init` creates a
 *   fresh, live UndoManager, then restores the pre-fork stacks (merge() itself
 *   reinstates the undo stack BlockNote captured at fork time).
 *
 * Liveness probe: a yjs UndoManager adds ITSELF to `trackedOrigins` in its
 * constructor and removes itself in `destroy()` — `trackedOrigins.has(um)`
 * is therefore "is this manager alive" without touching underscore internals.
 * If upstream fixes the destroy, the rebuild becomes a detected no-op.
 */

interface UndoManagerLike {
  undoStack: unknown[];
  redoStack: unknown[];
  trackedOrigins?: Set<unknown>;
}

/** The editor members the guard touches; see UndoableEditor for the rationale. */
export interface UndoGuardEditor extends UndoableEditor {
  replaceExtension?: (
    toUnregister: string[] | undefined,
    toRegister: unknown[]
  ) => void;
}

function isAlive(um: UndoManagerLike): boolean {
  return um.trackedOrigins?.has(um) ?? false;
}

/**
 * Same pattern as disableGcOnAIFork: this guard reaches into BlockNote's fork
 * store and y-prosemirror's plugin state. If either moves, it must get loud
 * instead of silently doing nothing — the tests drive the real editor, but a
 * future upgrade could still strand a call site.
 */
function createDriftWarner() {
  let warned = false;
  return (what: string) => {
    if (warned) return;
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[docs] AI undo guard inactive — ${what}. Undo/redo will stay dead after an AI edit. Re-check guardDocUndoAcrossAIFork against the installed @blocknote/core.`
    );
  };
}

/**
 * Attach the guard to a mounted editor. Returns an unsubscribe function; a
 * no-op when the editor has no fork extension (non-collaborative surfaces).
 */
export function guardDocUndoAcrossAIFork(
  editor: UndoGuardEditor | null,
  { isCollaborative = false }: { isCollaborative?: boolean } = {}
): () => void {
  if (!editor) return () => {};
  const warnDrift = createDriftWarner();
  const store = getDocForkStore(editor);
  if (!store?.subscribe) {
    if (isCollaborative) {
      warnDrift('ForkYDocExtension exposes no subscribable store');
    }
    return () => {};
  }

  // merge() reinstates the undo stack it captured at fork time, but nothing
  // preserves the redo stack — carry it across the cycle here.
  let savedRedoStack: unknown[] | null = null;

  const onForkStart = () => {
    const um = getDocUndoManager(editor) as UndoManagerLike | null;
    if (!um) {
      warnDrift('forked but no undo manager could be read from the plugin state');
      return;
    }
    // Fresh arrays: BlockNote captured the old undoStack REFERENCE in its fork
    // state before this listener runs, so reassigning (not clearing in place)
    // keeps its merge-time restore intact.
    savedRedoStack = um.redoStack;
    um.undoStack = [];
    um.redoStack = [];
  };

  const onMergeEnd = () => {
    const um = getDocUndoManager(editor) as UndoManagerLike | null;
    if (!um) {
      warnDrift('merged but no undo manager could be read from the plugin state');
      return;
    }
    const undoStack = um.undoStack;
    const redoStack = savedRedoStack ?? [];
    savedRedoStack = null;

    if (!isAlive(um)) {
      if (!editor.replaceExtension) {
        warnDrift('editor exposes no replaceExtension to rebuild the undo plugin');
        return;
      }
      // Two steps on purpose: remove-then-add drops the `y-undo$` state field
      // in between, so the second reconfigure runs y-prosemirror's `init` and
      // creates a fresh UndoManager. A single replace would carry the dead
      // instance over again (same plugin key).
      editor.replaceExtension(['yUndo'], []);
      editor.replaceExtension(undefined, [YUndoExtension()]);
    }

    const fresh = getDocUndoManager(editor) as UndoManagerLike | null;
    if (!fresh || !isAlive(fresh)) {
      warnDrift('rebuilding the yUndo plugin did not produce a live UndoManager');
      return;
    }
    fresh.undoStack = undoStack;
    fresh.redoStack = redoStack;
  };

  let wasForked = store.state?.isForked ?? false;
  // Cover an editor that mounts while a review is already forked: its manager
  // is fresh but the review-phase stacks should still read as unavailable.
  if (wasForked) onForkStart();

  return store.subscribe(() => {
    const isForked = store.state?.isForked ?? false;
    if (isForked === wasForked) return;
    wasForked = isForked;
    if (isForked) {
      onForkStart();
    } else {
      onMergeEnd();
    }
  });
}
