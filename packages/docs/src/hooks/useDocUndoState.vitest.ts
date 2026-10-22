// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration } from '@blocknote/core/yjs';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { guardDocUndoAcrossAIFork, type UndoGuardEditor } from '../lib/undoAcrossAIFork';
import { getDocUndoFlags, subscribeDocUndoFlags, type UndoableEditor } from './useDocUndoState';

/** Same headless awareness stand-in as undoAcrossAIFork.vitest.ts. */
function fakeAwareness() {
  const states = new Map<number, Record<string, unknown>>();
  let local: Record<string, unknown> = {};
  return {
    getStates: () => states,
    getLocalState: () => local,
    setLocalStateField: (k: string, v: unknown) => {
      local = { ...local, [k]: v };
    },
    on: () => {},
    off: () => {},
  };
}

function createCollabEditor() {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('doc');
  const editor = BlockNoteEditor.create(
    withCollaboration({
      collaboration: {
        fragment,
        user: { name: 'Test User', color: '#FF0000' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: { awareness: fakeAwareness() } as any,
      },
    })
  );
  editor.mount(document.createElement('div'));
  const stopGuard = guardDocUndoAcrossAIFork(editor as unknown as UndoGuardEditor, {
    isCollaborative: true,
    fragment,
  });
  return { editor, doc, stopGuard };
}

function setText(editor: BlockNoteEditor, text: string) {
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: [{ text, styles: {}, type: 'text' }] },
  ]);
}

function stopCapturing(editor: BlockNoteEditor) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yUndoPluginKey.getState(editor.prosemirrorState as any)!.undoManager.stopCapturing();
}

let ctx: ReturnType<typeof createCollabEditor> | undefined;
let unsubscribe: (() => void) | undefined;

afterEach(() => {
  unsubscribe?.();
  ctx?.stopGuard();
  ctx?.editor.unmount();
  ctx?.doc.destroy();
  ctx = undefined;
  unsubscribe = undefined;
});

/**
 * The toolbar buttons show what the subscriber last reported. Each check
 * compares that against the stacks read directly afterwards: a mismatch is a
 * button that stays disabled over a working Cmd+Z, or enabled over nothing.
 */
function watch(editor: BlockNoteEditor) {
  const undoable = editor as unknown as UndoableEditor;
  let reported = { canUndo: false, canRedo: false };
  unsubscribe = subscribeDocUndoFlags(undoable, (flags) => {
    reported = flags;
  });
  return {
    reported: () => reported,
    actual: () => getDocUndoFlags(undoable),
  };
}

describe('subscribeDocUndoFlags', () => {
  it('reports redo as soon as an undo has happened', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    const flags = watch(editor);
    setText(editor, 'Eins');

    editor.undo();

    expect(flags.actual()).toEqual({ canUndo: false, canRedo: true });
    expect(flags.reported()).toEqual(flags.actual());
  });

  it('reports the stacks after accepting an AI edit with a redo stack at fork time', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    const flags = watch(editor);
    setText(editor, 'Original');
    stopCapturing(editor);
    setText(editor, 'Getippt');
    editor.undo();
    expect(flags.actual().canRedo).toBe(true);

    const fork = editor.getExtension(ForkYDocExtension)!;
    fork.fork();
    setText(editor, 'KI-Vorschlag');
    fork.merge({ keepChanges: true });

    // Whether the pre-fork redo item survives is the guard's business; the
    // buttons only have to show the stacks as they are.
    expect(flags.actual().canUndo).toBe(true);
    expect(flags.reported()).toEqual(flags.actual());
  });

  it('reports redo after undoing the accepted AI edit', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    const flags = watch(editor);
    setText(editor, 'Original');

    const fork = editor.getExtension(ForkYDocExtension)!;
    fork.fork();
    setText(editor, 'KI-Vorschlag');
    fork.merge({ keepChanges: true });
    editor.undo();

    expect(editor.prosemirrorState.doc.textContent).toBe('Original');
    expect(flags.actual().canRedo).toBe(true);
    expect(flags.reported()).toEqual(flags.actual());
  });
});
