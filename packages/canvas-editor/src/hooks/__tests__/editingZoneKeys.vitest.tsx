import { usePageUndoRedoShortcuts } from '@ggraphic/editor/components/CanvasEditor/hooks/usePageUndoRedoShortcuts';
import { useCanvasKeyboardHandlers } from '@ggraphic/editor/hooks/useCanvasKeyboardHandlers';
import { useCanvasUndoRedo } from '@ggraphic/editor/hooks/useCanvasUndoRedo';
import { SidebarSlider } from '@ggraphic/editor/sidebar/components/SidebarSlider';
import { CanvasStoreProvider, useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { KEEP_EDITING_ATTR } from '@ggraphic/editor/utils/keyboardOwnership';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasCommands } from '@ggraphic/editor/utils/canvasCommands';

/**
 * Steht der Fokus in der Formatleiste des offenen Texteditors (Tab aus dem
 * Text), wird weiter Text bearbeitet: Rück löscht nicht das Element, Strg+Z
 * nimmt nicht die Canvas-Historie zurück. Und eine Taste, die ein Widget schon
 * verbraucht hat (Radix-Regler bei Alt+Pfeil), schiebt nicht zusätzlich.
 */

function setupKeyboard() {
  const store = createCanvasEditorStore();
  const state = {
    shapeInstances: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, fill: '#005538' }],
  } as unknown as BaseCanvasState;
  const updateShape = vi.fn();
  const commands = {
    remove: vi.fn(),
    duplicate: vi.fn(),
  } as unknown as CanvasCommands;
  renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state,
      actions: { updateShape },
      setState: vi.fn(),
      setSelectedElement: (id: string | null) => store.getState().setSelectedElement(id),
      commands,
    })
  );
  act(() => store.getState().setSelectedElement('shape-1'));
  return { store, updateShape, commands };
}

function mountToolbarButton(): HTMLButtonElement {
  document.body.innerHTML = `<div role="toolbar" ${KEEP_EDITING_ATTR}><button>Fett</button></div>`;
  const button = document.querySelector('button') as HTMLButtonElement;
  button.focus();
  return button;
}

function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Formatleiste des offenen Texteditors', () => {
  it('Rück und Entf an einem Leistenknopf löschen das Element nicht', () => {
    const h = setupKeyboard();
    const button = mountToolbarButton();
    press(button, { key: 'Backspace' });
    press(button, { key: 'Delete' });
    expect(h.commands.remove).not.toHaveBeenCalled();
  });

  it('Strg+D und Alt+Pfeil an einem Leistenknopf wirken nicht auf das Element', () => {
    const h = setupKeyboard();
    const button = mountToolbarButton();
    press(button, { key: 'd', ctrlKey: true, metaKey: true });
    press(button, { key: 'ArrowRight', altKey: true });
    expect(h.commands.duplicate).not.toHaveBeenCalled();
    expect(h.updateShape).not.toHaveBeenCalled();
  });

  it('Strg+Z an einem Leistenknopf lässt die Canvas-Historie stehen', () => {
    let store: CanvasEditorStoreApi | null = null;
    function Page() {
      useCanvasUndoRedo(250, undefined, true);
      store = useCanvasStore();
      return null;
    }
    render(
      <CanvasStoreProvider>
        <Page />
      </CanvasStoreProvider>
    );
    if (!store) throw new Error('store not captured');
    const s: CanvasEditorStoreApi = store;
    s.getState().saveToHistory({ n: 1 });
    s.getState().saveToHistory({ n: 2 });
    const before = s.getState().historyIndex;

    const button = mountToolbarButton();
    press(button, { key: 'z', ctrlKey: true, metaKey: true });
    expect(s.getState().historyIndex).toBe(before);

    // Gegenprobe: ausserhalb der Leiste nimmt Strg+Z zurück.
    press(document.body, { key: 'z', ctrlKey: true, metaKey: true });
    expect(s.getState().historyIndex).toBe(before - 1);
  });

  it('Strg+Z an einem Leistenknopf nimmt keinen Seitenschritt zurück', () => {
    const undoPageOp = vi.fn();
    renderHook(() =>
      usePageUndoRedoShortcuts({
        activePageStamps: () => null,
        pageOpStamps: () => ({ undo: 1, redo: 1 }),
        undoPageOp,
        redoPageOp: vi.fn(),
      })
    );
    const button = mountToolbarButton();
    press(button, { key: 'z', ctrlKey: true, metaKey: true });
    expect(undoPageOp).not.toHaveBeenCalled();
  });
});

describe('Alt+Pfeil am Regler', () => {
  function OpacitySlider() {
    const [value, setValue] = useState(0.5);
    return (
      <SidebarSlider
        label="Deckkraft"
        value={value}
        onValueChange={setValue}
        min={0}
        max={1}
        step={0.1}
        unit="%"
      />
    );
  }

  it('stellt den Wert und schiebt das Element nicht', () => {
    const h = setupKeyboard();
    render(<OpacitySlider />);
    const thumb = screen.getByRole('slider', { name: 'Deckkraft' });
    act(() => thumb.focus());
    fireEvent.keyDown(thumb, { key: 'ArrowRight', altKey: true });
    expect(thumb).toHaveAttribute('aria-valuenow', '0.6');
    expect(h.updateShape).not.toHaveBeenCalled();
  });
});
