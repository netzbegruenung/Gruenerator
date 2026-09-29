// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { ForkYDocExtension, withCollaboration } from '@blocknote/core/yjs';
import { ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { YSyncBindingConsistencyExtension } from './ySyncBindingConsistency';

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

function createCollabEditor({ guarded }: { guarded: boolean }) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('doc');
  const awareness = fakeAwareness();
  const editor = BlockNoteEditor.create(
    withCollaboration({
      extensions: guarded ? [YSyncBindingConsistencyExtension] : [],
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

describe('remote cursors across the AI merge (no guard — documents the upstream bug)', () => {
  // merge() swaps the yjs plugins back via replaceExtension; the new ySync view
  // re-renders and dispatches `{ binding }` before BlockNote rebinds `type`/`doc`.
  // The re-added cursor plugin resolves the collaborator's cursor in the fork
  // doc against the original mapping (GlitchTip #659). If this test ever fails,
  // upstream fixed it and the extension can go.
  it.each([false, true])(
    'merge({ keepChanges: %s }) throws while a collaborator has a cursor',
    (keepChanges) => {
      ctx = createCollabEditor({ guarded: false });
      forkExt(ctx.editor).fork();
      expect(() => forkExt(ctx!.editor).merge({ keepChanges })).toThrow(/nodeSize/);
    }
  );
});

describe('YSyncBindingConsistencyExtension', () => {
  it.each([false, true])('merge({ keepChanges: %s }) completes and re-syncs', (keepChanges) => {
    ctx = createCollabEditor({ guarded: true });
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
    ctx = createCollabEditor({ guarded: true });
    const { editor } = ctx;
    for (const keepChanges of [false, true, false]) {
      forkExt(editor).fork();
      expect(() => forkExt(editor).merge({ keepChanges })).not.toThrow();
    }
  });
});
