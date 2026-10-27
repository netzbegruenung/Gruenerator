import { useCanvasKeyboardHandlers } from '@ggraphic/editor/hooks/useCanvasKeyboardHandlers';
import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { isWidgetOwnedKey } from '@ggraphic/editor/utils/keyboardOwnership';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { CanvasCommands } from '@ggraphic/editor/utils/canvasCommands';

/**
 * Tastenhoheit: was ein fokussiertes Widget selbst verbraucht (Pfeile am
 * Regler, Enter am Knopf), erreicht die Canvas-Aktionen nicht. Entf und die
 * Strg-Kürzel gelten weiter von jedem Fokus ausserhalb von Textfeldern (R1).
 */

function setup() {
  const store = createCanvasEditorStore();
  const state = {
    shapeInstances: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, fill: '#005538' }],
  } as unknown as BaseCanvasState;
  const updateShape = vi.fn();
  const commands = {
    insertFrameImage: vi.fn(() => true),
    remove: vi.fn(),
  } as unknown as CanvasCommands;
  const setSelectedElement = vi.fn((id: string | null) => store.getState().setSelectedElement(id));
  renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state,
      actions: { updateShape },
      setState: vi.fn(),
      setSelectedElement,
      commands,
    })
  );
  act(() => store.getState().setSelectedElement('shape-1'));
  return { store, updateShape, commands };
}

function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

function mount(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tastenhoheit im globalen Handler', () => {
  it('Enter an einem fokussierten Knopf öffnet keine Dateiauswahl', () => {
    const h = setup();
    const button = mount('<button>Weiter</button>');
    press(button, { key: 'Enter' });
    expect(h.commands.insertFrameImage).not.toHaveBeenCalled();
  });

  it('Enter ausserhalb eines Widgets greift weiter', () => {
    const h = setup();
    press(document.body, { key: 'Enter' });
    expect(h.commands.insertFrameImage).toHaveBeenCalledTimes(1);
  });

  it('ArrowRight am Regler schiebt das Element nicht', () => {
    const h = setup();
    const slider = mount('<span role="slider" tabindex="0"></span>');
    press(slider, { key: 'ArrowRight' });
    expect(h.updateShape).not.toHaveBeenCalled();
  });

  it('Alt+ArrowRight am Regler schiebt um 1, Alt+Shift um 10', () => {
    const h = setup();
    const slider = mount('<span role="slider" tabindex="0"></span>');
    press(slider, { key: 'ArrowRight', altKey: true });
    expect(h.updateShape).toHaveBeenLastCalledWith('shape-1', { x: 11, y: 20 });
    press(slider, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(h.updateShape).toHaveBeenLastCalledWith('shape-1', { x: 20, y: 20 });
  });

  it('Entf an einem fokussierten Knopf löscht weiter (R1)', () => {
    const h = setup();
    const button = mount('<button>Weiter</button>');
    press(button, { key: 'Delete' });
    expect(h.commands.remove).toHaveBeenCalledTimes(1);
  });

  it('Escape im Dialog behält die Auswahl', () => {
    const h = setup();
    const dialog = mount('<div role="dialog"><span id="x" tabindex="0">x</span></div>');
    press(dialog.querySelector('#x') as Element, { key: 'Escape' });
    expect(h.store.getState().selectedElement).toBe('shape-1');
  });

  it('Enter auf dem Seiten-Knopf beendet einen Ausschnitt', () => {
    const h = setup();
    act(() => h.store.getState().setCroppingElement('shape-1'));
    const page = mount('<button data-page-focus-target="p1">Seite 1 bearbeiten</button>');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      page.dispatchEvent(event);
    });
    expect(h.store.getState().croppingElement).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(h.store.getState().selectedElement).toBe('shape-1');
  });

  it('Escape ausserhalb hebt die Auswahl auf', () => {
    const h = setup();
    press(document.body, { key: 'Escape' });
    expect(h.store.getState().selectedElement).toBeNull();
  });
});

describe('isWidgetOwnedKey', () => {
  const cases: Array<[string, string, KeyboardEventInit, boolean]> = [
    ['Enter on button', '<button></button>', { key: 'Enter' }, true],
    ['Space on link', '<a href="#x"></a>', { key: ' ' }, true],
    ['Enter inside role=option child', '<div role="option"><i></i></div>', { key: 'Enter' }, true],
    ['Enter on checkbox role', '<div role="checkbox"></div>', { key: 'Enter' }, true],
    ['Enter on plain div', '<div></div>', { key: 'Enter' }, false],
    ['Enter on listbox itself', '<div role="listbox"></div>', { key: 'Enter' }, false],
    ['ArrowDown on slider', '<div role="slider"></div>', { key: 'ArrowDown' }, true],
    ['Home on tablist', '<div role="tablist"></div>', { key: 'Home' }, true],
    ['PageUp on listbox', '<div role="listbox"></div>', { key: 'PageUp' }, true],
    ['ArrowLeft on range input', '<input type="range" />', { key: 'ArrowLeft' }, true],
    ['ArrowLeft on select', '<select></select>', { key: 'ArrowLeft' }, true],
    [
      'Alt+ArrowRight on slider',
      '<div role="slider"></div>',
      { key: 'ArrowRight', altKey: true },
      false,
    ],
    ['ArrowRight on button', '<button></button>', { key: 'ArrowRight' }, false],
    ['ArrowRight on plain div', '<div></div>', { key: 'ArrowRight' }, false],
    ['Delete on option', '<div role="option"></div>', { key: 'Delete' }, false],
    ['Escape in dialog', '<div role="dialog"><b></b></div>', { key: 'Escape' }, true],
    ['Escape in menu', '<div role="menu"><b></b></div>', { key: 'Escape' }, true],
    ['Escape on plain div', '<div></div>', { key: 'Escape' }, false],
  ];
  it.each(cases)('%s', (_name, html, init, expected) => {
    const root = mount(html);
    const target = root.firstElementChild ?? root;
    const ev = new KeyboardEvent('keydown', { bubbles: true, ...init });
    Object.defineProperty(ev, 'target', {
      value: html.includes('<b>') || html.includes('<i>') ? target : root,
    });
    expect(isWidgetOwnedKey(ev)).toBe(expected);
  });
});
