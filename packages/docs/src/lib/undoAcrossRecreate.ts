import { getDocUndoManager, type UndoableEditor } from '../hooks/useDocUndoState';

/**
 * Carry the undo/redo history across an editor recreation (#3262).
 *
 * `useCreateBlockNote` rebuilds the editor whenever its deps change identity —
 * deliberately when `threadStore` flips with `editable`, incidentally when the
 * collaboration provider remounts. The recreated editor gets a brand-new
 * y-prosemirror UndoManager, silently resetting the whole undo history even
 * though the content (in the Y.Doc) never changed.
 *
 * The stacks themselves stay valid across the recreation: yjs stack items are
 * plain insertion/deletion sets scoped to the shared fragment, not to the
 * manager that captured them. So the old incarnation parks its stacks keyed by
 * the fragment, and the next incarnation bound to the SAME fragment adopts
 * them. What does not survive is y-prosemirror's selection-restore metadata
 * (keyed by the old editor binding) — undo after a recreation restores the
 * content but not the caret position, which degrades gracefully.
 *
 * The WeakMap keeps the parked stacks exactly as long as the fragment (and
 * thus the Y.Doc) is alive: closing the document releases both, while
 * reopening it on a still-live Y.Doc restores the history — same-session
 * continuity for free.
 */

interface UndoManagerLike {
  undoStack: unknown[];
  redoStack: unknown[];
}

const parkedHistories = new WeakMap<object, { undoStack: unknown[]; redoStack: unknown[] }>();

/**
 * Adopt any history parked for `fragment`, and return a cleanup that parks the
 * current history for the next incarnation. Attach once per editor instance,
 * alongside the other undo guards.
 */
export function carryUndoAcrossEditorRecreate(
  editor: UndoableEditor | null,
  fragment: object | null
): () => void {
  if (!editor || !fragment) return () => {};

  const um = getDocUndoManager(editor) as UndoManagerLike | null;
  const parked = parkedHistories.get(fragment);
  // Only adopt onto a pristine manager — if this editor already captured
  // something, the parked history is stale and adopting it would interleave
  // two histories.
  if (um && parked && um.undoStack.length === 0 && um.redoStack.length === 0) {
    um.undoStack = parked.undoStack;
    um.redoStack = parked.redoStack;
  }
  parkedHistories.delete(fragment);

  return () => {
    const current = getDocUndoManager(editor) as UndoManagerLike | null;
    if (!current) return;
    if (current.undoStack.length > 0 || current.redoStack.length > 0) {
      parkedHistories.set(fragment, {
        undoStack: current.undoStack,
        redoStack: current.redoStack,
      });
    }
  };
}
