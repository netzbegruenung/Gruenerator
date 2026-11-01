// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration } from '@blocknote/core/yjs';
import { ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

const REMOTE_CLIENT = 424242;

/** Awareness stand-in (see undoAcrossAIFork.vitest.ts) that can hold a remote peer. */
function fakeAwareness() {
  const states = new Map<number, Record<string, unknown>>();
  let local: Record<string, unknown> = {};
  return {
    states,
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
  const awareness = fakeAwareness();
  const editor = BlockNoteEditor.create(
    withCollaboration({
      collaboration: {
        fragment,
        user: { name: 'Test User', color: '#FF0000' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: { awareness } as any,
      },
    })
  );
  const div = document.createElement('div');
  editor.mount(div);
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: 'Erster Absatz' },
    { type: 'paragraph', content: 'Zweiter Absatz' },
  ]);
  // A collaborator whose cursor sits at the end of the document. Resolving it
  // walks every top-level sibling through the binding's type→node mapping.
  const end = Y.relativePositionToJSON(
    Y.createRelativePositionFromTypeIndex(fragment, fragment.length)
  );
  awareness.states.set(REMOTE_CLIENT, {
    user: { name: 'Remote', color: '#00FF00' },
    cursor: { anchor: end, head: end },
  });
  return { editor, doc, fragment };
}

function forkExt(editor: BlockNoteEditor) {
  return editor.getExtension(ForkYDocExtension)!;
}

function ySyncState(editor: BlockNoteEditor) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ySyncPluginKey.getState(editor.prosemirrorState as any) as {
    type: Y.XmlFragment;
    doc: Y.Doc;
    binding: { type: Y.XmlFragment };
  };
}

let ctx: ReturnType<typeof createCollabEditor> | undefined;

afterEach(() => {
  ctx?.editor.unmount();
  ctx?.doc.destroy();
  ctx = undefined;
});

// Up to 0.55, merge() dispatched the new ySync binding before rebinding the
// plugin state's `type`/`doc`, and the cursor plugin then resolved a
// collaborator's cursor against the wrong doc and threw out of merge() midway
// (GlitchTip #659, TypeCellOS/BlockNote#3135). We patched the transaction with
// YSyncBindingConsistencyExtension; 0.56 resets the plugin state itself
// (#3090). These pin the fix so a regression fails here, not on accept/reject.
describe('AI merge while a collaborator has a cursor', () => {
  it.each([false, true])('merge({ keepChanges: %s }) completes and re-syncs', (keepChanges) => {
    ctx = createCollabEditor();
    const { editor, fragment } = ctx;

    forkExt(editor).fork();
    expect(ySyncState(editor).type).not.toBe(fragment);
    editor.replaceBlocks([editor.document[0]], [{ type: 'paragraph', content: 'KI-Vorschlag' }]);

    expect(() => forkExt(editor).merge({ keepChanges })).not.toThrow();
    expect(forkExt(editor).store.state.isForked).toBe(false);
    const state = ySyncState(editor);
    expect(state.type).toBe(fragment);
    expect(state.doc).toBe(fragment.doc);
    expect(state.binding.type).toBe(fragment);

    const text = editor.prosemirrorState.doc.textContent;
    expect(text.includes('KI-Vorschlag')).toBe(keepChanges);
    expect(text.includes('Erster Absatz')).toBe(!keepChanges);

    // Back on the synced doc: local edits reach the original fragment again.
    editor.insertBlocks([{ type: 'paragraph', content: 'Nachher' }], editor.document[0], 'after');
    expect(JSON.stringify(fragment.toJSON())).toContain('Nachher');
  });

  it('survives repeated fork/merge cycles', () => {
    ctx = createCollabEditor();
    const { editor } = ctx;
    for (const keepChanges of [false, true, false]) {
      forkExt(editor).fork();
      expect(() => forkExt(editor).merge({ keepChanges })).not.toThrow();
    }
  });
});
