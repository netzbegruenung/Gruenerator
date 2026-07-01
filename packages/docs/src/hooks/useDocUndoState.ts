import { useCallback, useEffect, useState } from 'react';
import { yUndoPluginKey } from 'y-prosemirror';

export interface DocUndoState {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

// The subset of the BlockNote editor we touch. Loosely typed on purpose:
// BlockNote's editor type is generic over the schema and its ProseMirror
// EditorState is not worth threading through here — the undo path is the same
// for every schema.
export interface UndoableEditor {
  undo: () => void;
  redo: () => void;
  prosemirrorState?: unknown;
  onChange?: (cb: () => void) => (() => void) | undefined;
}

/**
 * Read the local user's undo/redo availability from y-prosemirror's plugin
 * state — the same per-user stack `Cmd+Z` drives. Pure; safe to call from
 * non-React code (e.g. the mobile DOM bridge) as well as the hook below.
 */
export function getDocUndoFlags(editor: UndoableEditor | null): {
  canUndo: boolean;
  canRedo: boolean;
} {
  if (!editor) return { canUndo: false, canRedo: false };
  // Boundary cast: y-prosemirror's PluginKey.getState wants a ProseMirror
  // EditorState we don't re-type here. In collab docs the yUndo plugin is
  // always present; hasUndoOps/hasRedoOps track the local user's own stack.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = yUndoPluginKey.getState(editor.prosemirrorState as any);
  if (!state) {
    // Non-collaborative editors fall back to ProseMirror's history plugin,
    // whose availability we can't cheaply read — keep the buttons enabled so
    // undo/redo stays reachable (docs are always collaborative in practice).
    return { canUndo: true, canRedo: true };
  }
  return { canUndo: state.hasUndoOps, canRedo: state.hasRedoOps };
}

/**
 * Reactive undo/redo state for a mounted document editor. Reads y-prosemirror's
 * per-user undo stack (the same one `Cmd+Z` drives) so toolbar buttons can
 * enable/disable and trigger undo/redo. Purely a discoverability layer over the
 * keyboard shortcuts BlockNote already wires up — no separate history is kept.
 */
export function useDocUndoState(editor: UndoableEditor | null): DocUndoState {
  const [flags, setFlags] = useState(() => getDocUndoFlags(editor));

  useEffect(() => {
    if (!editor) {
      setFlags({ canUndo: false, canRedo: false });
      return;
    }
    const update = () => setFlags(getDocUndoFlags(editor));
    update();
    // onChange fires after each content transaction — exactly when the undo /
    // redo stacks can change (including after an undo, redo, or AI accept).
    const unsub = editor.onChange?.(update);
    return () => unsub?.();
  }, [editor]);

  const undo = useCallback(() => editor?.undo(), [editor]);
  const redo = useCallback(() => editor?.redo(), [editor]);

  return { canUndo: flags.canUndo, canRedo: flags.canRedo, undo, redo };
}
