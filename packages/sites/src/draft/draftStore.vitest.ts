import { addSiteItem, setSiteField } from '@gruenerator/contracts/site-ydoc';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { createSiteDraftStore } from './draftStore';
import { seededDoc } from './testDoc';

describe('createSiteDraftStore', () => {
  it('store follows setSiteField', () => {
    const ydoc = seededDoc();
    const store = createSiteDraftStore(ydoc);
    setSiteField(ydoc, 'site_title', 'Neu');
    expect(store.getState().draft.site_title).toBe('Neu');
    store.destroy();
  });

  it('a selector on site_title is not notified for a contact_phone change', () => {
    const ydoc = seededDoc();
    const store = createSiteDraftStore(ydoc);
    const listener = vi.fn();
    store.subscribe((state, prev) => {
      if (!Object.is(state.draft.site_title, prev.draft.site_title)) listener();
    });
    setSiteField(ydoc, 'contact_phone', '0123');
    expect(listener).not.toHaveBeenCalled();
    setSiteField(ydoc, 'site_title', 'Anders');
    expect(listener).toHaveBeenCalledTimes(1);
    store.destroy();
  });

  it('destroy unsubscribes from the doc', () => {
    const ydoc: Y.Doc = seededDoc();
    const store = createSiteDraftStore(ydoc);
    store.destroy();
    setSiteField(ydoc, 'site_title', 'Nach destroy');
    expect(store.getState().draft.site_title).not.toBe('Nach destroy');
  });
});

describe('structural sharing', () => {
  it('keeps the blocks reference when only site_title changes', () => {
    const ydoc = seededDoc();
    const store = createSiteDraftStore(ydoc);
    const themes = store.getState().draft.blocks.find((block) => block.type === 'themes');
    addSiteItem(ydoc, themes!.id);
    const before = store.getState().draft.blocks;
    setSiteField(ydoc, 'site_title', 'Anders');
    expect(store.getState().draft.blocks).toBe(before);
    store.destroy();
  });

  it('keeps an untouched block reference when another block changes', () => {
    const ydoc = seededDoc();
    const store = createSiteDraftStore(ydoc);
    const [, about, banner] = store.getState().draft.blocks;
    addSiteItem(ydoc, store.getState().draft.blocks.find((b) => b.type === 'themes')!.id);
    expect(store.getState().draft.blocks[1]).toBe(about);
    expect(store.getState().draft.blocks[2]).toBe(banner);
    store.destroy();
  });
});
