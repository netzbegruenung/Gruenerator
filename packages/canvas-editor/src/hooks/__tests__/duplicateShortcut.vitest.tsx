import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasKeyboardHandlers } from '../useCanvasKeyboardHandlers';
import { createCanvasEditorStore } from '../../stores/createCanvasEditorStore';

import type { BaseCanvasState } from '../../configs/factory/baseTypes';

/**
 * Strg+D am lebenden Hook.
 *
 * Der Grund für diese Datei ist ein Fehler, den die reinen Tests von
 * `duplicateElement` bauartbedingt nicht sehen: das Duplizieren war jahrelang
 * NICHT rückgängig zu machen, weil `setState` allein keinen Verlaufseintrag
 * schreibt. Wer den Zweig anfasst, verliert das leicht wieder — etwa indem er
 * die neue Id im Updater von `setState` einsammelt, den React erst beim
 * nächsten Rendern ruft.
 */

function setup(initial?: Partial<BaseCanvasState>) {
  const store = createCanvasEditorStore();
  let state = {
    shapeInstances: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, fill: '#005538' }],
    additionalTexts: [],
    ...initial,
  } as unknown as BaseCanvasState;

  const setState = vi.fn((partial) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
  });
  const setSelectedElement = vi.fn((id: string | null) => {
    store.getState().setSelectedElement(id);
  });
  const saveToHistory = vi.fn();

  const view = renderHook(
    (props: { state: BaseCanvasState }) =>
      useCanvasKeyboardHandlers({
        store,
        state: props.state,
        actions: {},
        setState,
        setSelectedElement,
        saveToHistory,
      }),
    { initialProps: { state } }
  );

  return {
    store,
    setState,
    setSelectedElement,
    saveToHistory,
    currentState: () => state,
    rerender: () => view.rerender({ state }),
  };
}

/** Die Auswahl der Kopie haengt an einem `setTimeout(…, 0)` aus dem Bestand:
 *  sie wird erst gesetzt, wenn die Zustandsaenderung durch ist. */
function pressCtrlD() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
  });
  act(() => {
    vi.runAllTimers();
  });
}

describe('Strg+D', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('legt eine Kopie an und wählt sie aus', () => {
    const h = setup();
    act(() => h.store.getState().setSelectedElement('shape-1'));

    pressCtrlD();

    expect(h.currentState().shapeInstances).toHaveLength(2);
    expect(h.setSelectedElement).toHaveBeenCalledWith(h.currentState().shapeInstances[1].id);
  });

  /**
   * Der eigentliche Regressionspunkt: ohne Verlaufseintrag lässt sich die Kopie
   * nicht rückgängig machen.
   */
  it('schreibt einen Verlaufseintrag', () => {
    const h = setup();
    act(() => h.store.getState().setSelectedElement('shape-1'));

    pressCtrlD();

    expect(h.saveToHistory).toHaveBeenCalledTimes(1);
  });

  /**
   * Und zwar mit dem Zustand NACH der Kopie. Ein Eintrag mit dem alten Stand
   * sieht im Test wie ein Erfolg aus und macht beim Rückgängig nichts —
   * genau das passiert, wenn man den Verlauf mit einem Ref füttert, das erst
   * beim nächsten Rendern nachzieht.
   */
  it('übergibt dem Verlauf den Zustand samt Kopie', () => {
    const h = setup();
    act(() => h.store.getState().setSelectedElement('shape-1'));

    pressCtrlD();

    const saved = h.saveToHistory.mock.calls[0][0] as BaseCanvasState;
    expect(saved.shapeInstances).toHaveLength(2);
  });

  it('rührt ein Vorlagen-Element nicht an', () => {
    const h = setup();
    act(() => h.store.getState().setSelectedElement('quote-text'));

    pressCtrlD();

    expect(h.currentState().shapeInstances).toHaveLength(1);
    expect(h.saveToHistory).not.toHaveBeenCalled();
  });

  it('bleibt ohne Auswahl wirkungslos', () => {
    const h = setup();

    pressCtrlD();

    expect(h.currentState().shapeInstances).toHaveLength(1);
    expect(h.saveToHistory).not.toHaveBeenCalled();
  });

  /**
   * Der Eingabeschutz stand früher HINTER dem Duplizier-Zweig und wirkte
   * deshalb für ihn nicht: Strg+D beim Tippen in einem Seitenleisten-Feld
   * setzte eine Kopie auf die Fläche.
   */
  it('greift nicht, während in einem Textfeld getippt wird', () => {
    const h = setup();
    act(() => h.store.getState().setSelectedElement('shape-1'));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    });

    expect(h.currentState().shapeInstances).toHaveLength(1);
    input.remove();
  });
});
