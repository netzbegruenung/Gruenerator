import { ForkYDocExtension } from '@blocknote/core/yjs';
import { ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';

import { disableGcOnAIFork } from './forkedDocGc';

/**
 * Reproduces what xl-ai does for a selection-scoped AI edit: anchor a relative
 * position inside a block, then have the AI replace that block. Returns whether
 * the anchor is still resolvable — BlockNote throws "Position not found, cannot
 * track positions" when it is not.
 */
function anchorSurvivesBlockReplace(gc: boolean): boolean {
  const doc = new Y.Doc({ gc });
  const fragment = doc.getXmlFragment('prosemirror');
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  fragment.insert(0, [paragraph]);
  text.insert(0, 'Der markierte Absatz');

  const anchor = Y.createRelativePositionFromTypeIndex(text, 5);

  doc.transact(() => {
    fragment.delete(0, 1);
    const rewritten = new Y.XmlElement('paragraph');
    const rewrittenText = new Y.XmlText();
    rewritten.insert(0, [rewrittenText]);
    fragment.insert(0, [rewritten]);
    rewrittenText.insert(0, 'Der neu geschriebene Absatz');
  });

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
    disableGcOnAIFork(editor, null);
    expect(forkDoc.gc).toBe(true);

    fork();
    expect(forkDoc.gc).toBe(false);
  });

  it('leaves the synced doc alone', () => {
    const mainDoc = new Y.Doc();
    const { editor, fork } = fakeEditor({ boundDoc: mainDoc, isForked: false });

    disableGcOnAIFork(editor, mainDoc);
    fork();

    expect(mainDoc.gc).toBe(true);
  });

  it('covers an editor mounting into an in-progress review', () => {
    const forkDoc = new Y.Doc();
    const { editor } = fakeEditor({ boundDoc: forkDoc, isForked: true });

    disableGcOnAIFork(editor, null);

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

    disableGcOnAIFork(editor, mainDoc);
    fork();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('AI fork GC guard inactive');
    warn.mockRestore();
  });

  it('warns when the fork extension no longer exposes a store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    disableGcOnAIFork({ getExtension: () => undefined, prosemirrorState: {} }, new Y.Doc());

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('stays quiet on a non-collaborative editor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    disableGcOnAIFork({ getExtension: () => undefined, prosemirrorState: {} }, null);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
