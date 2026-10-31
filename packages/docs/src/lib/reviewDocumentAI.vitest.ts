// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration, YjsVersioningExtension } from '@blocknote/core/yjs';
import { AIExtension } from '@blocknote/xl-ai';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDocAIExtension } from './aiExtension';
import { invokeDocumentAI, noteDocAIResponse } from './invokeDocumentAI';
import { acceptDocumentAI, rejectDocumentAI, rememberAIReviewFork } from './reviewDocumentAI';
import { guardDocUndoAcrossAIFork } from './undoAcrossAIFork';
import { type UndoableEditor } from '../hooks/useDocUndoState';
import { useEditorStore } from '../stores/editorStore';

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const DOC_ID = 'doc-1';

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

function setup({ versioning = false }: { versioning?: boolean } = {}) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('doc');
  const collab = withCollaboration({
    collaboration: {
      fragment,
      user: { name: 'Test User', color: '#FF0000' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: { awareness: fakeAwareness() } as any,
    },
  });
  const editor = BlockNoteEditor.create({
    ...collab,
    extensions: [
      ...(collab.extensions ?? []),
      AIExtension(),
      ...(versioning
        ? [
            YjsVersioningExtension({
              storage: {
                list: async () => ({ versions: [] }),
                getContent: async () => {
                  throw new Error('not needed');
                },
              },
            } as never),
          ]
        : []),
    ],
  });
  editor.mount(document.createElement('div'));
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: [{ type: 'text', text: 'Original', styles: {} }] },
  ]);
  const provider = {
    document: doc,
    unsyncedChanges: 0,
    hasUnsyncedChanges: false,
    synced: true,
    forceSync: () => {},
  };
  useEditorStore.getState().setEditor(DOC_ID, editor as never);
  useEditorStore.getState().setDocContext(DOC_ID, { ydoc: doc, provider: provider as never });
  const unguard = guardDocUndoAcrossAIFork(editor as unknown as UndoableEditor, {
    isCollaborative: true,
    fragment,
  });
  return { editor, doc, fragment, unguard };
}

function fork(editor: BlockNoteEditor) {
  editor.getExtension(ForkYDocExtension)!.fork();
}

/** A fork as a chat AI invocation opens it. */
function aiFork(editor: BlockNoteEditor) {
  fork(editor);
  rememberAIReviewFork(DOC_ID);
}

function isForked(editor: BlockNoteEditor) {
  return editor.getExtension(ForkYDocExtension)!.store.state.isForked;
}

/** End position of the first text node — where the paragraph's text ends. */
function textEnd(editor: BlockNoteEditor) {
  let end = -1;
  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (node.isText && end < 0) end = pos + node.nodeSize;
  });
  return end;
}

/** What xl-ai's agent does: inserted text carries an `insertion` mark. */
function suggestInsertion(editor: BlockNoteEditor, text: string) {
  const view = editor.prosemirrorView!;
  const at = textEnd(editor);
  const mark = view.state.schema.mark('insertion', {});
  view.dispatch(view.state.tr.insert(at, view.state.schema.text(text, [mark])));
}

/** A person typing into the forked editor: plain text, no suggestion mark. */
function typePlain(editor: BlockNoteEditor, text: string) {
  const view = editor.prosemirrorView!;
  view.dispatch(view.state.tr.insertText(text, textEnd(editor)));
}

function undoDepth(editor: BlockNoteEditor) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return yUndoPluginKey.getState(editor.prosemirrorState as any)!.undoManager.undoStack.length;
}

/** The toasts arrive through a dynamic import of sonner. */
const flushToasts = () => new Promise((resolve) => setTimeout(resolve, 20));

let ctx: ReturnType<typeof setup> | undefined;

beforeEach(() => {
  toast.error.mockClear();
  toast.info.mockClear();
});

afterEach(() => {
  ctx?.unguard();
  ctx?.editor.unmount();
  ctx?.doc.destroy();
  useEditorStore.getState().removeEditor(DOC_ID);
  ctx = undefined;
});

describe('rejectDocumentAI', () => {
  it('drops the AI suggestion but keeps what the person typed during the review', () => {
    ctx = setup();
    const { editor, fragment } = ctx;
    aiFork(editor);
    suggestInsertion(editor, ' KI');
    typePlain(editor, ' Eigen');

    rejectDocumentAI(DOC_ID);

    expect(isForked(editor)).toBe(false);
    expect(editor.prosemirrorState.doc.textContent).toBe('Original Eigen');
    // The live, synced doc has it too — not just the local view.
    expect(fragment.toString()).toContain('Original Eigen');
    expect(fragment.toString()).not.toContain('KI');
  });

  it('restores the original exactly and adds no undo step when nothing was typed', () => {
    ctx = setup();
    const { editor, fragment } = ctx;
    const before = fragment.toString();
    const depthBefore = undoDepth(editor);
    aiFork(editor);
    suggestInsertion(editor, ' KI');

    rejectDocumentAI(DOC_ID);

    expect(editor.prosemirrorState.doc.textContent).toBe('Original');
    expect(fragment.toString()).toBe(before);
    expect(undoDepth(editor)).toBe(depthBefore);
  });

  // BlockNote 0.56's version preview forks the same way. Its fork holds an old
  // version; keeping "own edits" there would write that version onto the live doc.
  it('treats a fork it did not see an AI invocation open exactly like upstream', () => {
    ctx = setup();
    const { editor, fragment } = ctx;
    const before = fragment.toString();
    fork(editor);
    typePlain(editor, ' Alte Version');

    rejectDocumentAI(DOC_ID);

    expect(isForked(editor)).toBe(false);
    expect(fragment.toString()).toBe(before);
  });
});

describe('acceptDocumentAI', () => {
  it('does not report a broadcast failure for a review without suggestions', () => {
    ctx = setup();
    aiFork(ctx.editor);
    expect(acceptDocumentAI(DOC_ID)).toBe('merged');
  });

  it('merges the suggestion into the live doc', () => {
    ctx = setup();
    aiFork(ctx.editor);
    suggestInsertion(ctx.editor, ' KI');
    expect(acceptDocumentAI(DOC_ID)).toBe('merged');
    expect(ctx.fragment.toString()).toContain('Original KI');
  });
});

describe('invokeDocumentAI outcome', () => {
  function stubInvoke(run: (editor: BlockNoteEditor) => void) {
    const ext = getDocAIExtension(DOC_ID)!;
    ext.invokeAI = async () => {
      // Like xl-ai: fork first, then whatever the stream produced.
      fork(ctx!.editor);
      run(ctx!.editor);
    };
  }

  it('keeps the review open when the AI suggested something', async () => {
    ctx = setup();
    stubInvoke((editor) => suggestInsertion(editor, ' KI'));

    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    expect(isForked(ctx.editor)).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('closes an empty review and says so instead of showing accept/reject', async () => {
    ctx = setup();
    stubInvoke(() => {});

    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    expect(isForked(ctx.editor)).toBe(false);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failed request as an error and closes the empty review', async () => {
    ctx = setup();
    stubInvoke(() => noteDocAIResponse(DOC_ID, 500));

    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    expect(isForked(ctx.editor)).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('leaves a fork it did not open alone after an empty run', async () => {
    ctx = setup();
    fork(ctx.editor); // e.g. the version preview
    stubInvoke(() => {});

    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    expect(isForked(ctx.editor)).toBe(true);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  // BlockNote 0.56's version preview holds the fork read-only. xl-ai's fork()
  // would be a no-op and the suggestions would land in the preview.
  it('does not run while the version history holds the fork', async () => {
    ctx = setup({ versioning: true });
    const versioning = ctx.editor.getExtension('versioning') as unknown as {
      open: () => boolean;
      close: () => void;
    };
    versioning.open();
    const invoke = vi.fn();
    getDocAIExtension(DOC_ID)!.invokeAI = invoke;

    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    expect(invoke).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(isForked(ctx.editor)).toBe(true);
    versioning.close();
  });

  it('reports a failed follow-up request but keeps the earlier suggestions', async () => {
    ctx = setup();
    stubInvoke((editor) => suggestInsertion(editor, ' KI'));
    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'x' });
    await flushToasts();

    stubInvoke(() => noteDocAIResponse(DOC_ID, 429));
    await invokeDocumentAI({ documentId: DOC_ID, userPrompt: 'y' });
    await flushToasts();

    expect(isForked(ctx.editor)).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
