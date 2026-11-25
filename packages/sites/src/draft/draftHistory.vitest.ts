import { addSiteBlock, decodeSiteDraft, setSiteField } from '@gruenerator/contracts/site-ydoc';
import { PluginKey } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createDraftHistory } from './draftHistory';
import { seededDoc } from './testDoc';

describe('createDraftHistory', () => {
  it('starts empty on a freshly seeded draft', () => {
    const history = createDraftHistory(seededDoc());
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false });
    history.destroy();
  });

  it('undoes and redoes a field edit and a new block', () => {
    const ydoc = seededDoc();
    const history = createDraftHistory(ydoc);
    const blocks = decodeSiteDraft(ydoc).blocks.length;
    setSiteField(ydoc, 'site_title', 'Neu');
    expect(addSiteBlock(ydoc, 'about', 1)).not.toBeNull();
    expect(history.getState().canUndo).toBe(true);

    history.undo();
    expect(decodeSiteDraft(ydoc).site_title).toBe('Mustermensch');
    expect(decodeSiteDraft(ydoc).blocks).toHaveLength(blocks);
    expect(history.getState()).toEqual({ canUndo: false, canRedo: true });

    history.redo();
    expect(decodeSiteDraft(ydoc).site_title).toBe('Neu');
    expect(decodeSiteDraft(ydoc).blocks).toHaveLength(blocks + 1);
    history.destroy();
  });

  it('ignores what the rich-text binding writes on its own', () => {
    const ydoc = seededDoc();
    const history = createDraftHistory(ydoc);
    const fragment = ydoc.getXmlFragment('rt:block:x');
    // y-sync normalises a fragment when its editor mounts; that is no edit to undo.
    ydoc.transact(() => fragment.insert(0, [new Y.XmlText('Hallo')]), new PluginKey('y-sync'));
    expect(history.getState().canUndo).toBe(false);
    history.destroy();
  });

  it("leaves other people's edits alone", () => {
    const ydoc = seededDoc();
    const history = createDraftHistory(ydoc);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(ydoc));
    setSiteField(remote, 'site_title', 'Von woanders');
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote), 'provider');
    expect(history.getState().canUndo).toBe(false);
    expect(decodeSiteDraft(ydoc).site_title).toBe('Von woanders');
    history.destroy();
  });
});
