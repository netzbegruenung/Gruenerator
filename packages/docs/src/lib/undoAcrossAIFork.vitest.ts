// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration } from '@blocknote/core/yjs';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDocUndoFlags, type UndoableEditor } from '../hooks/useDocUndoState';
import { guardDocUndoAcrossAIFork, type UndoGuardEditor } from './undoAcrossAIFork';

/**
 * Minimal awareness stand-in for a headless test editor. YCursorExtension and
 * y-prosemirror's cursor plugin only touch these five members; a real
 * y-protocols Awareness would drag in an undeclared dependency for no gain.
 */
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
  const div = document.createElement('div');
  editor.mount(div);
  return { editor, doc, fragment };
}

function getText(editor: BlockNoteEditor) {
  return editor.prosemirrorState.doc.textContent;
}

function setText(editor: BlockNoteEditor, text: string) {
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: [{ text, styles: {}, type: 'text' }] },
  ]);
}

function getUndoManager(editor: BlockNoteEditor) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return yUndoPluginKey.getState(editor.prosemirrorState as any)!.undoManager;
}

function forkExt(editor: BlockNoteEditor) {
  return editor.getExtension(ForkYDocExtension)!;
}

let ctx: ReturnType<typeof createCollabEditor> | undefined;

afterEach(() => {
  ctx?.editor.unmount();
  ctx?.doc.destroy();
  ctx = undefined;
});

describe('undo across the AI fork/merge cycle (no guard — documents the upstream bug)', () => {
  // BlockNote's ForkYDoc fork()/merge() swap the yjs plugins via
  // replaceExtension. ProseMirror carries the yUndo plugin STATE over (same
  // plugin key), so the same UndoManager survives — but it destroys the plugin
  // VIEWS, and y-prosemirror's undo-plugin view destroy() calls
  // undoManager.destroy(), unhooking it from the doc's afterTransaction.
  // If this test ever fails, upstream fixed it and the guard can go.
  it('the surviving UndoManager is destroyed by the fork and captures nothing after merge', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    setText(editor, 'Original');

    const before = getUndoManager(editor);
    // A live yjs UndoManager tracks itself (constructor); destroy() removes it.
    expect(before.trackedOrigins.has(before)).toBe(true);
    expect(before.undoStack.length).toBeGreaterThan(0);

    forkExt(editor).fork();
    setText(editor, 'KI-Vorschlag');
    forkExt(editor).merge({ keepChanges: true });

    const after = getUndoManager(editor);
    expect(after).toBe(before); // state carried over — same instance
    expect(after.trackedOrigins.has(after)).toBe(false); // …but destroyed

    const stackLenAfterMerge = after.undoStack.length;
    setText(editor, 'Nachher');
    // The destroyed manager no longer captures local edits.
    expect(after.undoStack.length).toBe(stackLenAfterMerge);
  });

  it('undo during AI review mutates the hidden original doc', () => {
    ctx = createCollabEditor();
    const { editor, fragment } = ctx;
    setText(editor, 'Original');

    forkExt(editor).fork();
    const originalJson = fragment.toJSON();
    editor.undo();
    // The stale pre-fork stack applies to the original fragment — invisible to
    // the local user (the editor shows the fork) but synced to collaborators.
    expect(fragment.toJSON()).not.toBe(originalJson);
    forkExt(editor).merge({ keepChanges: false });
  });

  it('the toolbar flags stay enabled over the dead stack during review', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    setText(editor, 'Original');
    forkExt(editor).fork();
    expect(getDocUndoFlags(editor as unknown as UndoableEditor).canUndo).toBe(true);
    forkExt(editor).merge({ keepChanges: false });
  });
});

describe('guardDocUndoAcrossAIFork', () => {
  function guarded() {
    ctx = createCollabEditor();
    const stop = guardDocUndoAcrossAIFork(ctx.editor as unknown as UndoGuardEditor, {
      isCollaborative: true,
    });
    return { ...ctx, stop };
  }

  it('post-merge edits are undoable again after accept', () => {
    const { editor } = guarded();
    setText(editor, 'Original');

    forkExt(editor).fork();
    setText(editor, 'KI-Vorschlag');
    forkExt(editor).merge({ keepChanges: true });

    const um = getUndoManager(editor);
    expect(um.trackedOrigins.has(um)).toBe(true); // live again

    setText(editor, 'Nachher');
    expect(getDocUndoFlags(editor as unknown as UndoableEditor).canUndo).toBe(true);
    editor.undo();
    expect(getText(editor)).toBe('KI-Vorschlag');
  });

  it('post-merge edits are undoable again after reject', () => {
    const { editor } = guarded();
    setText(editor, 'Original');

    forkExt(editor).fork();
    setText(editor, 'KI-Vorschlag');
    forkExt(editor).merge({ keepChanges: false });
    expect(getText(editor)).toBe('Original');

    setText(editor, 'Nachher');
    editor.undo();
    expect(getText(editor)).toBe('Original');
  });

  it('pre-fork undo history survives the cycle', () => {
    const { editor } = guarded();
    setText(editor, 'Eins');
    getUndoManager(editor).stopCapturing();
    setText(editor, 'Zwei');

    forkExt(editor).fork();
    forkExt(editor).merge({ keepChanges: false });

    editor.undo();
    expect(getText(editor)).toBe('Eins');
  });

  it('pre-fork redo history survives the cycle', () => {
    const { editor } = guarded();
    setText(editor, 'Eins');
    getUndoManager(editor).stopCapturing();
    setText(editor, 'Zwei');
    editor.undo();
    expect(getText(editor)).toBe('Eins');

    forkExt(editor).fork();
    forkExt(editor).merge({ keepChanges: false });

    expect(getDocUndoFlags(editor as unknown as UndoableEditor).canRedo).toBe(true);
    editor.redo();
    expect(getText(editor)).toBe('Zwei');
  });

  it('during review, undo is unavailable and leaves the hidden original doc alone', () => {
    const { editor, fragment } = guarded();
    setText(editor, 'Original');

    forkExt(editor).fork();
    expect(getDocUndoFlags(editor as unknown as UndoableEditor)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    const originalJson = fragment.toJSON();
    editor.undo();
    expect(fragment.toJSON()).toBe(originalJson);

    forkExt(editor).merge({ keepChanges: false });
    // …and back after the review.
    expect(getDocUndoFlags(editor as unknown as UndoableEditor).canUndo).toBe(true);
  });

  it('two consecutive AI cycles keep undo alive', () => {
    const { editor } = guarded();
    setText(editor, 'Original');

    forkExt(editor).fork();
    setText(editor, 'KI 1');
    forkExt(editor).merge({ keepChanges: true });

    forkExt(editor).fork();
    setText(editor, 'KI 2');
    forkExt(editor).merge({ keepChanges: true });

    setText(editor, 'Nachher');
    editor.undo();
    expect(getText(editor)).toBe('KI 2');
  });

  describe('AI merge as an undo step (#3261, fragment passed)', () => {
    function guardedWithFragment() {
      ctx = createCollabEditor();
      const stop = guardDocUndoAcrossAIFork(ctx.editor as unknown as UndoGuardEditor, {
        isCollaborative: true,
        fragment: ctx.fragment,
      });
      return { ...ctx, stop };
    }

    it('undo directly after accept reverts the AI change, redo reapplies it', () => {
      const { editor } = guardedWithFragment();
      setText(editor, 'Original');

      forkExt(editor).fork();
      setText(editor, 'KI-Vorschlag');
      forkExt(editor).merge({ keepChanges: true });
      expect(getText(editor)).toBe('KI-Vorschlag');

      expect(getDocUndoFlags(editor as unknown as UndoableEditor).canUndo).toBe(true);
      editor.undo();
      expect(getText(editor)).toBe('Original');

      expect(getDocUndoFlags(editor as unknown as UndoableEditor).canRedo).toBe(true);
      editor.redo();
      expect(getText(editor)).toBe('KI-Vorschlag');
    });

    it('undo unwinds in order: post-merge edit, then AI change, then pre-fork history', () => {
      const { editor } = guardedWithFragment();
      setText(editor, 'Eins');
      getUndoManager(editor).stopCapturing();
      setText(editor, 'Zwei');

      forkExt(editor).fork();
      setText(editor, 'KI-Vorschlag');
      forkExt(editor).merge({ keepChanges: true });

      setText(editor, 'Nachher');
      editor.undo();
      expect(getText(editor)).toBe('KI-Vorschlag');
      editor.undo();
      expect(getText(editor)).toBe('Zwei');
      editor.undo();
      expect(getText(editor)).toBe('Eins');
    });

    it('reject adds no phantom undo step', () => {
      const { editor } = guardedWithFragment();
      setText(editor, 'Eins');
      getUndoManager(editor).stopCapturing();
      setText(editor, 'Zwei');
      const stackLenBefore = getUndoManager(editor).undoStack.length;

      forkExt(editor).fork();
      setText(editor, 'KI-Vorschlag');
      forkExt(editor).merge({ keepChanges: false });
      expect(getText(editor)).toBe('Zwei');

      expect(getUndoManager(editor).undoStack.length).toBe(stackLenBefore);
      editor.undo();
      expect(getText(editor)).toBe('Eins');
    });

    it('an editor torn down mid-review destroys the capture manager', () => {
      // Install before any manager exists — yjs binds destroy per instance,
      // so a later prototype spy would miss calls on existing managers.
      const destroySpy = vi.spyOn(Y.UndoManager.prototype, 'destroy');
      try {
        const { editor, stop } = guardedWithFragment();
        setText(editor, 'Original');
        forkExt(editor).fork();

        const callsAfterFork = destroySpy.mock.calls.length;
        stop();
        // Exactly one more — the capture manager; stop() tears down nothing else.
        expect(destroySpy.mock.calls.length).toBe(callsAfterFork + 1);
        forkExt(editor).merge({ keepChanges: false });
      } finally {
        destroySpy.mockRestore();
      }
    });
  });

  it('is a silent no-op without collaboration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = BlockNoteEditor.create();
    const stop = guardDocUndoAcrossAIFork(editor as unknown as UndoGuardEditor, {
      isCollaborative: false,
    });
    expect(warn).not.toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it('warns when collaboration is expected but the fork store is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guardDocUndoAcrossAIFork(
      {
        undo: () => {},
        redo: () => {},
        getExtension: () => undefined,
      } as unknown as UndoGuardEditor,
      { isCollaborative: true }
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('AI undo guard inactive');
    warn.mockRestore();
  });
});
