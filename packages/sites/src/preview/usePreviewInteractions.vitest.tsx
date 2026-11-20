import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '../stores/editorStore';

import { selectionAt, usePreviewHighlight, usePreviewSelection } from './usePreviewInteractions';

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument('frame');
  doc.body.innerHTML = `
    <header><a id="logo">Logo</a></header>
    <section data-section="hero"><h1><span data-field="site_title" id="name">Name</span></h1></section>
    <section data-section="themes">
      <ul data-field="sections.themes">
        <li data-index="0"><article><h3 data-field="sections.themes.0.title">A</h3></article></li>
        <li data-index="1"><article><p id="card-body">Text</p></article></li>
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
    dialog: null,
    focusedField: null,
    highlightedElement: null,
  });
});

describe('selectionAt', () => {
  it('names the section, the field and the card under a target', () => {
    const doc = buildDoc();
    expect(selectionAt(doc.getElementById('name'))).toEqual({
      section: 'hero',
      path: 'site_title',
      index: null,
    });
    expect(selectionAt(doc.getElementById('card-body'))).toEqual({
      section: 'themes',
      path: 'sections.themes',
      index: 1,
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
      section: 'themes',
      path: 'sections.themes',
      index: 1,
    });
    act(() => {
      doc.getElementById('name')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(useEditorStore.getState().selection?.section).toBe('hero');
    act(() => doc.getElementById('logo')?.click());
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('closes the panel first on Escape, then the selection', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => {
      useEditorStore.getState().select({ section: 'hero', path: null, index: null });
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
      select({ section: 'themes', path: null, index: 0 });
      openElementPanel('image');
      select({ section: 'themes', path: null, index: 1 });
    });
    expect(useEditorStore.getState().elementPanel).toBe('image');
    act(() => select({ section: 'hero', path: null, index: null }));
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
        .select({ section: 'themes', path: 'sections.themes.0.title', index: 0 })
    );
    // The frame document is its own realm, so jest-dom's element matchers do not apply.
    const has = (selector: string, attribute: string) =>
      doc.querySelector(selector)?.hasAttribute(attribute);
    expect(has('[data-section="themes"]', 'data-editor-selected')).toBe(true);
    expect(has('[data-section="hero"]', 'data-editor-selected')).toBe(false);
    expect(has('[data-field="sections.themes.0.title"]', 'data-editor-active')).toBe(true);
  });
});

describe('focusPath', () => {
  it('opens the section form for a section field and the dialog for settings or legal', () => {
    const { focusPath } = useEditorStore.getState();
    act(() => focusPath('actions', 'sections.actions.0.link'));
    expect(useEditorStore.getState()).toMatchObject({
      selection: { section: 'actions' },
      elementPanel: 'details',
      dialog: null,
    });
    act(() => focusPath('legal', 'legal.name'));
    expect(useEditorStore.getState().dialog).toBe('legal');
  });
});
