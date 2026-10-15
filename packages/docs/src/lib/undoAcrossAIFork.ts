import * as Y from 'yjs';

import { getDocForkStore } from './aiExtension';
import { getDocUndoManager, type UndoableEditor } from '../hooks/useDocUndoState';

/**
 * Make an accepted AI merge one undo step (#3261).
 *
 * Every AI invocation forks the Y.Doc (ForkYDocExtension). Since BlockNote
 * 0.56 fork() and merge() rebuild the yUndo plugin with a live UndoManager and
 * carry its undo/redo stacks across the cycle themselves. What they still do
 * not do is record the merge: merge() applies the fork's changes via
 * `Y.applyUpdate(originalDoc, update, editor)` — origin = the editor instance,
 * while y-prosemirror's UndoManager only tracks the ySync origin, and
 * YUndoExtension takes no `trackedOrigins` option.
 *
 * So the guard runs a standalone Y.UndoManager on the ORIGINAL fragment for the
 * duration of the review, tracking the editor origin. During the review nothing
 * else writes to the original doc under that origin, so its only possible
 * capture is the merge itself. Its captured step is appended to the plugin
 * manager's stack (stack items are plain data scoped to the same fragment, so a
 * foreign manager can pop them — only the selection-restore metadata
 * y-prosemirror would have attached is missing, which degrades gracefully). On
 * reject nothing is captured and nothing is appended.
 */

/**
 * Same pattern as disableGcOnAIFork: this guard reaches into BlockNote's fork
 * store and y-prosemirror's plugin state. If either moves, it must get loud
 * instead of silently doing nothing.
 */
function createDriftWarner() {
  let warned = false;
  return (what: string) => {
    if (warned) return;
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[docs] AI undo guard inactive — ${what}. Accepting an AI edit will not be undoable. Re-check guardDocUndoAcrossAIFork against the installed @blocknote/core.`
    );
  };
}

/**
 * Attach the guard to a mounted editor. Returns an unsubscribe function; a
 * no-op when the editor has no fork extension (non-collaborative surfaces).
 */
export function guardDocUndoAcrossAIFork(
  editor: UndoableEditor | null,
  {
    isCollaborative = false,
    fragment = null,
  }: { isCollaborative?: boolean; fragment?: Y.XmlFragment | null } = {}
): () => void {
  if (!editor || !fragment) return () => {};
  const warnDrift = createDriftWarner();
  const store = getDocForkStore(editor);
  if (!store?.subscribe) {
    if (isCollaborative) {
      warnDrift('ForkYDocExtension exposes no subscribable store');
    }
    return () => {};
  }

  // Alive only between fork and merge.
  let mergeCapture: Y.UndoManager | null = null;

  const takeMergeCaptureSteps = (): unknown[] => {
    if (!mergeCapture) return [];
    const steps: unknown[] = [...mergeCapture.undoStack];
    mergeCapture.destroy();
    mergeCapture = null;
    return steps;
  };

  const onForkStart = () => {
    mergeCapture = new Y.UndoManager(fragment, {
      trackedOrigins: new Set([editor]),
      captureTimeout: 0,
    });
  };

  const onMergeEnd = () => {
    // By now merge() has already run its applyUpdate (the store flips to
    // un-forked last), so an accepted AI change sits captured in here; a
    // reject captured nothing.
    const aiSteps = takeMergeCaptureSteps();
    if (aiSteps.length === 0) return;
    const um = getDocUndoManager(editor) as { undoStack: unknown[]; redoStack: unknown[] } | null;
    if (!um) {
      warnDrift('merged but no undo manager could be read from the plugin state');
      return;
    }
    // A new step on top of the history invalidates what could be redone, as
    // with any other edit.
    um.undoStack.push(...aiSteps);
    um.redoStack = [];
  };

  let wasForked = store.state?.isForked ?? false;
  // Cover an editor that mounts while a review is already forked.
  if (wasForked) onForkStart();

  const unsubscribe = store.subscribe(() => {
    const isForked = store.state?.isForked ?? false;
    if (isForked === wasForked) return;
    wasForked = isForked;
    if (isForked) {
      onForkStart();
    } else {
      onMergeEnd();
    }
  });

  return () => {
    unsubscribe();
    // An editor torn down mid-review must not leave the capture manager
    // listening on the doc.
    if (mergeCapture) {
      mergeCapture.destroy();
      mergeCapture = null;
    }
  };
}
