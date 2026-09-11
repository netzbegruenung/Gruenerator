// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { withCollaboration } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { getDocUndoFlags, type UndoableEditor } from '../hooks/useDocUndoState';
import { carryUndoAcrossEditorRecreate } from './undoAcrossRecreate';

// Harness mirrors undoAcrossAIFork.vitest.ts — a real collab editor mounted in
// jsdom, with the 5-member awareness stand-in instead of y-protocols.
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

function createEditorOn(fragment: Y.XmlFragment) {
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
  return editor;
}

function getText(editor: BlockNoteEditor) {
  return editor.prosemirrorState.doc.textContent;
}

function setText(editor: BlockNoteEditor, text: string) {
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: [{ text, styles: {}, type: 'text' }] },
  ]);
}

function flags(editor: BlockNoteEditor) {
  return getDocUndoFlags(editor as unknown as UndoableEditor);
}

function carry(editor: BlockNoteEditor, fragment: Y.XmlFragment) {
  return carryUndoAcrossEditorRecreate(editor as unknown as UndoableEditor, fragment);
}

const docs: Y.Doc[] = [];
const editors: BlockNoteEditor[] = [];

function newDoc() {
  const doc = new Y.Doc();
  docs.push(doc);
  return { doc, fragment: doc.getXmlFragment('doc') };
}

function newEditor(fragment: Y.XmlFragment) {
  const editor = createEditorOn(fragment);
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((e) => e.unmount());
  docs.splice(0).forEach((d) => d.destroy());
});

describe('carryUndoAcrossEditorRecreate (#3262)', () => {
  it('a recreated editor on the same fragment keeps the undo history', () => {
    const { fragment } = newDoc();
    const first = newEditor(fragment);
    const stopFirst = carry(first, fragment);
    setText(first, 'Eins');
    expect(flags(first).canUndo).toBe(true);

    // Recreation: cleanup runs for the old incarnation, then the new editor
    // binds to the same fragment (what useCreateBlockNote does on a dep flip).
    stopFirst();
    first.unmount();
    const second = newEditor(fragment);
    expect(flags(second).canUndo).toBe(false); // fresh manager — the bug in #3262
    carry(second, fragment);

    expect(flags(second).canUndo).toBe(true);
    second.undo();
    expect(getText(second)).toBe('');
  });

  it('redo history survives the recreation too', () => {
    const { fragment } = newDoc();
    const first = newEditor(fragment);
    const stopFirst = carry(first, fragment);
    setText(first, 'Eins');
    first.undo();
    expect(flags(first).canRedo).toBe(true);

    stopFirst();
    first.unmount();
    const second = newEditor(fragment);
    carry(second, fragment);

    expect(flags(second).canRedo).toBe(true);
    second.redo();
    expect(getText(second)).toBe('Eins');
  });

  it('does not adopt a history parked for a different fragment', () => {
    const a = newDoc();
    const editorA = newEditor(a.fragment);
    const stopA = carry(editorA, a.fragment);
    setText(editorA, 'Eins');
    stopA();

    const b = newDoc();
    const editorB = newEditor(b.fragment);
    carry(editorB, b.fragment);
    expect(flags(editorB).canUndo).toBe(false);
  });

  it('an empty history parks nothing and a second cycle finds nothing stale', () => {
    const { fragment } = newDoc();
    const first = newEditor(fragment);
    const stopFirst = carry(first, fragment);
    stopFirst();
    first.unmount();

    const second = newEditor(fragment);
    carry(second, fragment);
    expect(flags(second)).toEqual({ canUndo: false, canRedo: false });
  });

  it('does not clobber a manager that already captured something', () => {
    const { fragment } = newDoc();
    const first = newEditor(fragment);
    const stopFirst = carry(first, fragment);
    setText(first, 'Eins');
    stopFirst();
    first.unmount();

    const second = newEditor(fragment);
    setText(second, 'Zwei'); // captured before the carry attaches
    carry(second, fragment);
    expect(flags(second).canUndo).toBe(true);
    second.undo();
    // The second editor's own step is intact; the stale parked one was dropped.
    expect(getText(second)).toBe('Eins');
    expect(flags(second).canUndo).toBe(false);
  });

  it('is a no-op without a fragment', () => {
    const { fragment } = newDoc();
    const editor = newEditor(fragment);
    const stop = carryUndoAcrossEditorRecreate(editor as unknown as UndoableEditor, null);
    stop();
    expect(flags(editor)).toEqual({ canUndo: false, canRedo: false });
  });
});
