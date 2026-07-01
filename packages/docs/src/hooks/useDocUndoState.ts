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
    // No yUndo plugin state — either a non-collaborative editor (ProseMirror
    // history, whose availability we can't cheaply read) or the brief window
    // where the fork/merge cycle has the plugin unregistered. Treat "unknown"
    // as "disabled": undo() would throw ("No undo plugin found") if the plugin
    // is genuinely absent, and buttons enabled over an unreadable stack are
    // misleading. Docs are always collaborative in practice, so this is the
    // safe default rather than the common path.
    return { canUndo: false, canRedo: false };
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

  // Guard the calls: BlockNote's undo()/redo() throw ("No undo plugin found")
  // if invoked while no undo plugin is registered (e.g. mid fork/merge). The
  // buttons are gated on canUndo/canRedo so this shouldn't fire, but match the
  // mobile bridge's defensive wrapping rather than risk an uncaught throw.
  const undo = useCallback(() => {
    try {
      editor?.undo();
    } catch {
      // no-op: nothing to undo / plugin momentarily absent
    }
  }, [editor]);
  const redo = useCallback(() => {
    try {
      editor?.redo();
    } catch {
      // no-op: nothing to redo / plugin momentarily absent
    }
  }, [editor]);

  return { canUndo: flags.canUndo, canRedo: flags.canRedo, undo, redo };
}
