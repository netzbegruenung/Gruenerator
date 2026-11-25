import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '../stores/editorStore';

import { selectionAt, usePreviewHighlight, usePreviewSelection } from './usePreviewInteractions';

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument('frame');
  doc.body.innerHTML = `
    <header><a id="logo">Logo</a></header>
    <section data-block-id="hero" data-block-type="hero"><h1><span data-field="site_title" id="name">Name</span></h1></section>
    <section data-block-id="th" data-block-type="themes">
      <ul data-field="blocks.th">
        <li data-item-id="c0"><article><h3 data-field="blocks.th.items.c0.title">A</h3></article></li>
        <li data-item-id="c1"><article><p id="card-body">Text</p></article></li>
      </ul>
    </section>`;
  return doc;
}

function Harness({ doc }: { doc: Document }) {
  usePreviewSelection(doc);
  usePreviewHighlight(doc);
  return null;
}

beforeEach(() => {
  useEditorStore.setState({
    selection: null,
    elementPanel: null,
    sidebarTab: null,
    focusedField: null,
    highlightedElement: null,
  });
});

describe('selectionAt', () => {
  it('names the section, the field and the card under a target', () => {
    const doc = buildDoc();
    expect(selectionAt(doc.getElementById('name'))).toEqual({
      blockId: 'hero',
      itemId: null,
      path: 'site_title',
    });
    expect(selectionAt(doc.getElementById('card-body'))).toEqual({
      blockId: 'th',
      itemId: 'c1',
      path: 'blocks.th',
    });
    expect(selectionAt(doc.getElementById('logo'))).toBeNull();
  });
});

describe('usePreviewSelection', () => {
  it('selects on click and on focus, and clears outside the sections', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => doc.getElementById('card-body')?.click());
    expect(useEditorStore.getState().selection).toEqual({
      blockId: 'th',
      itemId: 'c1',
      path: 'blocks.th',
    });
    act(() => {
      doc.getElementById('name')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(useEditorStore.getState().selection?.blockId).toBe('hero');
    act(() => doc.getElementById('logo')?.click());
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('closes the panel first on Escape, then the selection', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => {
      useEditorStore.getState().select({ blockId: 'hero', itemId: null, path: null });
      useEditorStore.getState().openElementPanel('details');
    });
    const escape = () =>
      act(() => {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
    escape();
    expect(useEditorStore.getState().elementPanel).toBeNull();
    expect(useEditorStore.getState().selection).not.toBeNull();
    escape();
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('keeps an open panel when the selection stays in its section, and drops it otherwise', () => {
    const { select, openElementPanel } = useEditorStore.getState();
    act(() => {
      select({ blockId: 'th', itemId: 'c0', path: null });
      openElementPanel('image');
      select({ blockId: 'th', itemId: 'c1', path: null });
    });
    expect(useEditorStore.getState().elementPanel).toBe('image');
    act(() => select({ blockId: 'hero', itemId: null, path: null }));
    expect(useEditorStore.getState().elementPanel).toBeNull();
  });
});

describe('usePreviewHighlight', () => {
  it('marks the selected section and the selected field', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() =>
      useEditorStore
        .getState()
        .select({ blockId: 'th', itemId: 'c0', path: 'blocks.th.items.c0.title' })
    );
    // The frame document is its own realm, so jest-dom's element matchers do not apply.
    const has = (selector: string, attribute: string) =>
      doc.querySelector(selector)?.hasAttribute(attribute);
    expect(has('[data-block-id="th"]', 'data-editor-selected')).toBe(true);
    expect(has('[data-block-id="hero"]', 'data-editor-selected')).toBe(false);
    expect(has('[data-item-id="c0"]', 'data-editor-selected')).toBe(true);
    expect(has('[data-item-id="c1"]', 'data-editor-selected')).toBe(false);
    expect(has('[data-field="blocks.th.items.c0.title"]', 'data-editor-active')).toBe(true);
  });
});

describe('focusPath', () => {
  it('opens the block form for a block field and the sidebar tab for settings or legal', () => {
    const { focusPath } = useEditorStore.getState();
    act(() => focusPath('ac', 'blocks.ac.items.t2.link'));
    expect(useEditorStore.getState()).toMatchObject({
      selection: { blockId: 'ac', itemId: 't2', path: 'blocks.ac.items.t2.link' },
      elementPanel: 'details',
      sidebarTab: null,
    });
    act(() => focusPath('legal', 'legal.name'));
    expect(useEditorStore.getState()).toMatchObject({
      sidebarTab: 'impressum',
      elementPanel: null,
    });
    act(() => focusPath('settings', 'subdomain'));
    expect(useEditorStore.getState().sidebarTab).toBe('einstellungen');
  });
});
