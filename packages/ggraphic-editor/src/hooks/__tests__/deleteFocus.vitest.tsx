// SPDX-License-Identifier: MPL-2.0
/**
 * Entf über die Tastatur: ging der Fokus mit dem Gelöschten verloren, landet
 * er auf dem Knopf der Seite, nicht auf `<body>`. Aus der Ebenen-Liste heraus
 * übernimmt die Liste selbst (nächster Eintrag), siehe `layersSection.vitest.tsx`.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCanvasKeyboardHandlers } from '@ggraphic/editor/hooks/useCanvasKeyboardHandlers';
import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { CanvasCommands } from '@ggraphic/editor/utils/canvasCommands';

function setup() {
  document.body.innerHTML = `
    <div class="canvas-editor-layout">
      <div class="heterogeneous-multipage__page-wrapper" role="group" aria-label="Seite 1" aria-current="page">
        <button type="button" data-page-focus-target="p1">Seite 1 bearbeiten</button>
      </div>
      <div role="listbox" aria-label="Ebenen">
        <div role="option" aria-selected="true" tabindex="0" data-layer-id="shape-1">Form</div>
      </div>
    </div>`;
  const store = createCanvasEditorStore();
  const commands = {
    remove: vi.fn(() => store.getState().setSelectedElement(null)),
    cut: vi.fn(() => store.getState().setSelectedElement(null)),
  } as unknown as CanvasCommands;
  renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state: {} as BaseCanvasState,
      actions: {},
      setState: vi.fn(),
      setSelectedElement: (id) => store.getState().setSelectedElement(id),
      commands,
    })
  );
  act(() => store.getState().setSelectedElement('shape-1'));
  const pageTarget = document.querySelector<HTMLElement>('[data-page-focus-target]')!;
  return { commands, pageTarget };
}

function press(target: EventTarget, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Fokus nach dem Löschen über die Tastatur', () => {
  it('geht von <body> auf den Knopf der Seite', async () => {
    const { commands, pageTarget } = setup();
    press(document.body, { key: 'Delete' });
    expect(commands.remove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pageTarget).toHaveFocus());
  });

  it('gilt auch für Ausschneiden', async () => {
    const { commands, pageTarget } = setup();
    press(document.body, { key: 'x', ctrlKey: true });
    expect(commands.cut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pageTarget).toHaveFocus());
  });

  it('überlässt den Fokus der Ebenen-Liste, wenn Entf dort gedrückt wurde', async () => {
    const { pageTarget } = setup();
    const option = document.querySelector<HTMLElement>('[role="option"]')!;
    option.focus();
    press(option, { key: 'Delete' });
    // Die Liste setzt den Fokus selbst; hier fiele er sonst auf die Seite.
    option.blur();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(pageTarget).not.toHaveFocus();
  });
});
