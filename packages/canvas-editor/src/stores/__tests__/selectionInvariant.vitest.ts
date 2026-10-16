/**
 * `selectedLayerIds` ist die Auswahl, `selectedElement` steht genau dann darin,
 * wenn es ein einziges Element ist. Alle Einzel-Oberflächen lesen nur
 * `selectedElement` und treten bei Mehrfachauswahl so von selbst zurück.
 */
import { describe, expect, it } from 'vitest';

import { createCanvasEditorStore } from '../createCanvasEditorStore';

const selection = (store: ReturnType<typeof createCanvasEditorStore>) => {
  const { selectedLayerIds, selectedElement } = store.getState();
  return { ids: selectedLayerIds, single: selectedElement };
};

describe('Auswahl-Invariante', () => {
  it('setSelectedElement setzt beides', () => {
    const store = createCanvasEditorStore();
    store.getState().setSelectedElement('a');
    expect(selection(store)).toEqual({ ids: ['a'], single: 'a' });
    store.getState().setSelectedElement(null);
    expect(selection(store)).toEqual({ ids: [], single: null });
  });

  it('Shift-Umschalten: zwei → keine Einzelauswahl, zurück auf eins → wieder Einzelauswahl', () => {
    const store = createCanvasEditorStore();
    store.getState().setSelectedElement('a');
    store.getState().selectLayer('b', true);
    expect(selection(store)).toEqual({ ids: ['a', 'b'], single: null });
    store.getState().selectLayer('a', true);
    expect(selection(store)).toEqual({ ids: ['b'], single: 'b' });
    store.getState().selectLayer('b', true);
    expect(selection(store)).toEqual({ ids: [], single: null });
  });

  it('setSelectedLayers entfernt Doppelte, deselectAll räumt beides', () => {
    const store = createCanvasEditorStore();
    store.getState().setSelectedLayers(['a', 'b', 'a']);
    expect(selection(store)).toEqual({ ids: ['a', 'b'], single: null });
    store.getState().setSelectedLayers(['c']);
    expect(selection(store)).toEqual({ ids: ['c'], single: 'c' });
    store.getState().deselectAll();
    expect(selection(store)).toEqual({ ids: [], single: null });
  });

  it('Undo/Redo lassen die Auswahl stehen', () => {
    const store = createCanvasEditorStore();
    store.getState().saveToHistory({ n: 1 });
    store.getState().setSelectedLayers(['a', 'b']);
    store.getState().saveToHistory({ n: 2 });
    store.getState().setSelectedElement('a');
    store.getState().undo();
    expect(selection(store)).toEqual({ ids: ['a'], single: 'a' });
    store.getState().redo();
    expect(selection(store)).toEqual({ ids: ['a'], single: 'a' });
  });
});
