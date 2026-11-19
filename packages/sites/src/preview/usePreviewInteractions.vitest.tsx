import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFieldRegistry } from '../hooks/useFieldRegistry';
import { useEditorStore } from '../stores/editorStore';

import {
  usePreviewClickToEdit,
  usePreviewHighlight,
  usePreviewScrollSync,
} from './usePreviewInteractions';

type IoCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

const observers: { callback: IoCallback; observe: ReturnType<typeof vi.fn> }[] = [];

class FakeIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: IoCallback) {
    observers.push({ callback, observe: this.observe });
  }
}

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument('frame');
  doc.body.innerHTML = `
    <section data-section="hero"><h1 data-field="site_title">Name</h1></section>
    <section data-section="themes">
      <h3 data-field="sections.themes.1.title"><span id="inner">Titel</span></h3>
    </section>`;
  return doc;
}

function Harness({ doc }: { doc: Document }) {
  const { registerField } = useFieldRegistry();
  usePreviewClickToEdit(doc);
  usePreviewScrollSync(doc);
  usePreviewHighlight(doc);
  return <input aria-label="Titel" ref={(el) => registerField('sections.themes.1.title', el)} />;
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  useEditorStore.setState({
    activeSection: 'hero',
    focusedField: null,
    highlightedElement: null,
    isScrollLocked: false,
    scrollSource: null,
    pendingScrollTo: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preview interactions', () => {
  it('a click on a data-field element selects its panel and focuses the field', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => {
      doc.getElementById('inner')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useEditorStore.getState().focusedField).toEqual({
      panel: 'themes',
      path: 'sections.themes.1.title',
    });
    expect(useEditorStore.getState().activeSection).toBe('themes');
    expect(screen.getByLabelText('Titel')).toHaveFocus();
    expect(doc.querySelector('[data-editor-active]')?.getAttribute('data-field')).toBe(
      'sections.themes.1.title'
    );
  });

  it('ignores clicks outside data-field elements', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => {
      doc.querySelector('section')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useEditorStore.getState().focusedField).toBeNull();
  });

  it('scroll sync moves the active section', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    const themes = doc.querySelector('[data-section="themes"]');
    act(() => {
      observers[0]?.callback([{ target: themes as Element, isIntersecting: true }]);
    });
    expect(useEditorStore.getState().activeSection).toBe('themes');
  });

  it('the observer is constructed once while activeSection changes three times', () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    act(() => useEditorStore.getState().setActiveSection('about'));
    act(() => useEditorStore.getState().setActiveSection('themes'));
    act(() => useEditorStore.getState().setActiveSection('contact'));
    expect(observers).toHaveLength(1);
  });

  it('re-observes sections that appear later', async () => {
    const doc = buildDoc();
    render(<Harness doc={doc} />);
    const before = observers[0]?.observe.mock.calls.length ?? 0;
    const added = doc.createElement('section');
    added.setAttribute('data-section', 'contact');
    doc.body.appendChild(added);
    await act(async () => {
      await Promise.resolve();
    });
    expect(observers[0]?.observe.mock.calls.length).toBe(before + 1);
  });

  it('a pending scroll scrolls the section into view with auto behavior under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const doc = buildDoc();
    const target = doc.querySelector('[data-section="themes"]') as HTMLElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    render(<Harness doc={doc} />);
    act(() => useEditorStore.getState().navigateToSection('themes'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(useEditorStore.getState().pendingScrollTo).toBeNull();
  });
});
