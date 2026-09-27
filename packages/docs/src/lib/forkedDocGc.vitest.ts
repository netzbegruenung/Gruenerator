import { ForkYDocExtension } from '@blocknote/core/yjs';
import { ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';

import { disableGcOnAIFork } from './forkedDocGc';

/** One paragraph, as the ySync binding would hold it. Returns its text type. */
function seedParagraph(doc: Y.Doc): Y.XmlText {
  const fragment = doc.getXmlFragment('prosemirror');
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  fragment.insert(0, [paragraph]);
  text.insert(0, 'Der markierte Absatz');
  return text;
}

/** What the streamed AI update does: drop the block and write a new one. */
function replaceBlock(doc: Y.Doc) {
  doc.transact(() => {
    const fragment = doc.getXmlFragment('prosemirror');
    fragment.delete(0, 1);
    const rewritten = new Y.XmlElement('paragraph');
    const rewrittenText = new Y.XmlText();
    rewritten.insert(0, [rewrittenText]);
    fragment.insert(0, [rewritten]);
    rewrittenText.insert(0, 'Der neu geschriebene Absatz');
  });
}

/**
 * What xl-ai does for a selection-scoped edit: anchor a relative position inside
 * a block, then have the AI replace that block. False means BlockNote would
 * throw "Position not found, cannot track positions".
 */
function anchorSurvivesBlockReplace(gc: boolean): boolean {
  const doc = new Y.Doc({ gc });
  const text = seedParagraph(doc);
  const anchor = Y.createRelativePositionFromTypeIndex(text, 5);
  replaceBlock(doc);
  return Y.createAbsolutePositionFromRelativePosition(anchor, doc) !== null;
}

function fakeEditor(opts: { boundDoc: Y.Doc; isForked: boolean }) {
  const listeners = new Set<() => void>();
  const store = {
    state: { isForked: opts.isForked },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    editor: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getExtension: (factory: any) => (factory === ForkYDocExtension ? { store } : undefined),
      // PluginKey.getState reads `state[key.key]`; the field is untyped in
      // prosemirror-state's public types, hence the cast.
      prosemirrorState: {
        [(ySyncPluginKey as unknown as { key: string }).key]: { doc: opts.boundDoc },
      },
    },
    fork: () => {
      store.state = { isForked: true };
      listeners.forEach((l) => l());
    },
  };
}

describe('forked doc GC', () => {
  it('drops AI-tracked anchors when GC is on, keeps them when it is off', () => {
    expect(anchorSurvivesBlockReplace(true)).toBe(false);
    expect(anchorSurvivesBlockReplace(false)).toBe(true);
  });

  it('turns GC off on the fork BlockNote creates', () => {
    const forkDoc = new Y.Doc();
    expect(forkDoc.gc).toBe(true);

    const { editor, fork } = fakeEditor({ boundDoc: forkDoc, isForked: false });
    disableGcOnAIFork(editor, { isCollaborative: true });
    expect(forkDoc.gc).toBe(true);

    fork();
    expect(forkDoc.gc).toBe(false);
  });

  // The whole fix in one run: guard mounted, BlockNote forks, xl-ai anchors the
  // selection, the streamed update replaces that block — and the anchor still
  // resolves. Without the guard the same sequence is exactly GRUENERATOR-F7.
  it('keeps a tracked anchor resolvable across the AI block replace', () => {
    const forkDoc = new Y.Doc();
    const text = seedParagraph(forkDoc);
    const { editor, fork } = fakeEditor({ boundDoc: forkDoc, isForked: false });

    disableGcOnAIFork(editor, { isCollaborative: true });
    fork();

    const anchor = Y.createRelativePositionFromTypeIndex(text, 5);
    replaceBlock(forkDoc);

    expect(Y.createAbsolutePositionFromRelativePosition(anchor, forkDoc)).not.toBeNull();
  });

  it('without the guard the same sequence loses the anchor', () => {
    const forkDoc = new Y.Doc();
    const text = seedParagraph(forkDoc);
    const { fork } = fakeEditor({ boundDoc: forkDoc, isForked: false });

    fork();

    const anchor = Y.createRelativePositionFromTypeIndex(text, 5);
    replaceBlock(forkDoc);

    expect(Y.createAbsolutePositionFromRelativePosition(anchor, forkDoc)).toBeNull();
  });

  // A fork whose bound doc is still the synced one cannot happen through
  // BlockNote's own fork() — which is why this backstop firing is itself drift,
  // and warns. Muted here so the assertion, not the console, carries the test.
  it('leaves the synced doc alone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mainDoc = new Y.Doc();
    const { editor, fork } = fakeEditor({ boundDoc: mainDoc, isForked: false });

    disableGcOnAIFork(editor, { syncedYdoc: mainDoc, isCollaborative: true });
    fork();

    expect(mainDoc.gc).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('covers an editor mounting into an in-progress review', () => {
    const forkDoc = new Y.Doc();
    const { editor } = fakeEditor({ boundDoc: forkDoc, isForked: true });

    disableGcOnAIFork(editor, { isCollaborative: true });

    expect(forkDoc.gc).toBe(false);
  });

  // The guard reads BlockNote / y-prosemirror internals. If those move, it must
  // become loud rather than a silent no-op — that is the whole point of the
  // warning, since every test above drives fakes and would stay green.
  it('warns when the fork exists but its Y.Doc cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mainDoc = new Y.Doc();
    const { editor, fork } = fakeEditor({ boundDoc: mainDoc, isForked: false });
    // Upstream moved the plugin state: nothing resolvable behind the key.
    editor.prosemirrorState = {};

    disableGcOnAIFork(editor, { syncedYdoc: mainDoc, isCollaborative: true });
    fork();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('AI fork GC guard inactive');
    warn.mockRestore();
  });

  it('warns when the fork extension no longer exposes a store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    disableGcOnAIFork(
      { getExtension: () => undefined, prosemirrorState: {} },
      { syncedYdoc: new Y.Doc(), isCollaborative: true }
    );

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('stays quiet on a non-collaborative editor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    disableGcOnAIFork({ getExtension: () => undefined, prosemirrorState: {} }, {});

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // useCollaboration hands out a placeholder `new Y.Doc()` before the provider
  // exists, so a truthy doc alone must not be read as "collaboration is on" —
  // otherwise a call site that skips the sync gate warns on every healthy mount.
  it('stays quiet when a doc exists but the editor has no collaboration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    disableGcOnAIFork(
      { getExtension: () => undefined, prosemirrorState: {} },
      { syncedYdoc: new Y.Doc(), isCollaborative: false }
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
