/**
 * Wohin der Fokus geht, wenn das, was ihn hatte, verschwindet: zurück zum
 * Ebenen-Eintrag, sonst auf den Knopf der Seite — nie auf `<body>`.
 */
import {
  captureFocusOrigin,
  pageFocusTarget,
  returnFocus,
  returnFocusToPage,
} from '@ggraphic/editor/utils/editorFocus';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function mountEditor() {
  document.body.innerHTML = `
    <div class="canvas-editor-layout">
      <div role="listbox" aria-label="Ebenen">
        <div role="option" aria-selected="false" tabindex="0" data-layer-id="a">Form: Kreis</div>
      </div>
      <div class="heterogeneous-multipage__page-wrapper" role="group" aria-label="Seite 1">
        <button type="button" data-page-focus-target="p1">Seite 1 bearbeiten</button>
        <div id="stage-1"></div>
      </div>
      <div class="heterogeneous-multipage__page-wrapper" role="group" aria-label="Seite 2" aria-current="page">
        <button type="button" data-page-focus-target="p2">Seite 2 bearbeiten</button>
        <div id="stage-2"></div>
      </div>
      <button type="button" id="elsewhere">Woanders</button>
    </div>`;
  const byId = (id: string) => document.getElementById(id)!;
  return {
    option: document.querySelector<HTMLElement>('[data-layer-id="a"]')!,
    page1: document.querySelector<HTMLElement>('[data-page-focus-target="p1"]')!,
    page2: document.querySelector<HTMLElement>('[data-page-focus-target="p2"]')!,
    stage1: byId('stage-1'),
    elsewhere: byId('elsewhere'),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pageFocusTarget', () => {
  it('nimmt den Knopf der Seite, in der der Anker liegt', () => {
    const dom = mountEditor();
    expect(pageFocusTarget(dom.stage1)).toBe(dom.page1);
  });

  it('nimmt ohne Anker die aktive Seite', () => {
    const dom = mountEditor();
    expect(pageFocusTarget(null)).toBe(dom.page2);
  });
});

describe('returnFocus', () => {
  it('geht zum Ebenen-Eintrag zurück, wenn die Bearbeitung dort begann', async () => {
    const dom = mountEditor();
    dom.option.focus();
    const origin = captureFocusOrigin(dom.stage1);
    dom.option.blur();
    returnFocus(origin);
    await waitFor(() => expect(dom.option).toHaveFocus());
  });

  it('geht sonst auf den Knopf der Seite', async () => {
    const dom = mountEditor();
    const origin = captureFocusOrigin(dom.stage1);
    returnFocus(origin);
    await waitFor(() => expect(dom.page1).toHaveFocus());
  });

  it('scrollt dabei nicht an den Kopf der Seite', async () => {
    const dom = mountEditor();
    const focus = vi.spyOn(dom.page1, 'focus');
    returnFocusToPage(dom.stage1);
    await waitFor(() => expect(focus).toHaveBeenCalledWith({ preventScroll: true }));
  });

  it('nimmt einem angeklickten Bedienelement den Fokus nicht', async () => {
    const dom = mountEditor();
    returnFocusToPage(dom.stage1);
    dom.elsewhere.focus();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(dom.elsewhere).toHaveFocus();
  });

  it('fällt auf die Seite zurück, wenn der Eintrag inzwischen weg ist', async () => {
    const dom = mountEditor();
    dom.option.focus();
    const origin = captureFocusOrigin(dom.stage1);
    dom.option.remove();
    returnFocus(origin);
    await waitFor(() => expect(dom.page1).toHaveFocus());
  });
});
