// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration } from '@blocknote/core/yjs';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDocUndoFlags, type UndoableEditor } from '../hooks/useDocUndoState';
import { guardDocUndoAcrossAIFork } from './undoAcrossAIFork';

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

describe('undo across the AI fork/merge cycle (BlockNote itself, no guard)', () => {
  // Up to 0.55, fork()/merge() carried the yUndo plugin state over while
  // destroying its views, which killed the UndoManager; guardDocUndoAcrossAIFork
  // rebuilt it. 0.56 resets the plugin state itself (`resetPluginStateFor`) and
  // carries both stacks. These pin that behaviour so an upgrade that regresses
  // it fails here instead of silently killing undo after the first AI edit.
  it('post-merge edits are undoable again after accept', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    setText(editor, 'Original');

    forkExt(editor).fork();
    setText(editor, 'KI-Vorschlag');
    forkExt(editor).merge({ keepChanges: true });

    const um = getUndoManager(editor);
    // A live yjs UndoManager tracks itself (constructor); destroy() removes it.
    expect(um.trackedOrigins.has(um)).toBe(true);

    setText(editor, 'Nachher');
    expect(getDocUndoFlags(editor as unknown as UndoableEditor).canUndo).toBe(true);
    editor.undo();
    expect(getText(editor)).toBe('KI-Vorschlag');
  });

  it('post-merge edits are undoable again after reject', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
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
    ctx = createCollabEditor();
    const { editor } = ctx;
    setText(editor, 'Eins');
    getUndoManager(editor).stopCapturing();
    setText(editor, 'Zwei');

    forkExt(editor).fork();
    forkExt(editor).merge({ keepChanges: false });

    editor.undo();
    expect(getText(editor)).toBe('Eins');
  });

  it('pre-fork redo history survives the cycle', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
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
    ctx = createCollabEditor();
    const { editor, fragment } = ctx;
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
    ctx = createCollabEditor();
    const { editor } = ctx;
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

  // Canary: if this ever fails, upstream records the merge itself and the
  // guard below would double-capture it — remove the guard then.
  it('an accepted AI merge is not an undo step on its own (#3261)', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    setText(editor, 'Original');
    getUndoManager(editor).stopCapturing();
    const stackLenBefore = getUndoManager(editor).undoStack.length;

    forkExt(editor).fork();
    setText(editor, 'KI-Vorschlag');
    forkExt(editor).merge({ keepChanges: true });

    expect(getUndoManager(editor).undoStack.length).toBe(stackLenBefore);
  });
});

describe('guardDocUndoAcrossAIFork', () => {
  describe('AI merge as an undo step (#3261)', () => {
    function guardedWithFragment() {
      ctx = createCollabEditor();
      const stop = guardDocUndoAcrossAIFork(ctx.editor as unknown as UndoableEditor, {
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
    const stop = guardDocUndoAcrossAIFork(editor as unknown as UndoableEditor, {
      isCollaborative: false,
      fragment: new Y.Doc().getXmlFragment('doc'),
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
      } as unknown as UndoableEditor,
      { isCollaborative: true, fragment: new Y.Doc().getXmlFragment('doc') }
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('AI undo guard inactive');
    warn.mockRestore();
  });
});
