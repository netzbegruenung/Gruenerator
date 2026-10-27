/**
 * Die Ebenen-Liste gegen einen echten Seiten-Store: Auswahl hin und zurück,
 * und die Tastatur der Seite (Entf) läuft weiter, während ein Eintrag den
 * Fokus hat (Regel R1).
 */
import {
  createCanvasEditorStore,
  type CanvasEditorStoreApi,
} from '@ggraphic/editor/stores/createCanvasEditorStore';
import { applyLayerSelection } from '@ggraphic/editor/utils/layerSelection';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasKeyboardHandlers } from '../../hooks/useCanvasKeyboardHandlers';
import { axe } from '../../test-utils';
import { createCanvasCommands } from '../../utils/canvasCommands';
import { pageLayerLabels } from '../../utils/layerLabels';
import { LayersSection } from '../sections/LayersSection';

import type { BaseCanvasState } from '../../configs/factory/baseTypes';
import type { LayoutResult } from '../../configs/types';
import type { CanvasItem } from '../../utils/canvasLayerManager';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';

const shape = (id: string, type: ShapeInstance['type']) =>
  ({ id, type, x: 0, y: 0 }) as ShapeInstance;

/** Zeichenfolge hinten → vorn: Kreis, Stern, Herz. Die Liste zeigt sie umgekehrt. */
const initialShapes = [shape('kreis', 'circle'), shape('stern', 'star'), shape('herz', 'heart')];

const renderListOf = (state: BaseCanvasState): CanvasItem[] =>
  (state.shapeInstances ?? []).map((s) => ({ id: s.id, type: 'shape', data: s }));

function Harness({
  store,
  onActivate,
  focusRequested = false,
}: {
  store: CanvasEditorStoreApi;
  onActivate: (id: string) => void;
  focusRequested?: boolean;
}) {
  // Die Türen lesen den Zustand beim Ausführen (Ref), gerendert wird der Stand.
  const [page, setPage] = useState({ shapeInstances: initialShapes } as unknown as BaseCanvasState);
  const stateRef = useRef(page);
  const commands = useMemo(() => {
    const setState = (
      next: Partial<BaseCanvasState> | ((prev: BaseCanvasState) => BaseCanvasState)
    ) => {
      stateRef.current =
        typeof next === 'function' ? next(stateRef.current) : { ...stateRef.current, ...next };
      setPage(stateRef.current);
    };
    const removeShape = (id: string) =>
      setState((s) => ({ ...s, shapeInstances: s.shapeInstances.filter((x) => x.id !== id) }));
    return createCanvasCommands<BaseCanvasState>({
      store,
      getState: () => stateRef.current,
      setState,
      saveToHistory: () => {},
      runHistoryBatch: (fn) => fn(),
      getActions: () => ({ removeShape }),
      template: () => null,
      getRenderList: () => renderListOf(stateRef.current),
      getStage: () => null,
      logicalScale: () => 1,
      getElements: () => [],
      getLayout: () => ({}) as LayoutResult,
      isReadOnly: () => false,
      getPageSize: () => ({ width: 1000, height: 1000 }),
    });
  }, [store]);

  useCanvasKeyboardHandlers({
    store,
    state: page,
    actions: {},
    setState: () => {},
    setSelectedElement: (id) => store.getState().setSelectedElement(id),
    commands,
  });

  const selectedIds = useStore(
    store,
    useShallow((s) => s.selectedLayerIds)
  );
  const state = page as unknown as Record<string, unknown>;
  return (
    <LayersSection
      layers={pageLayerLabels(renderListOf(page), state)}
      selectedIds={selectedIds}
      onSelect={(change) => applyLayerSelection(store, change)}
      onActivate={onActivate}
      focusRequested={focusRequested}
    />
  );
}

function setup(options: { focusRequested?: boolean } = {}) {
  const store = createCanvasEditorStore();
  const onActivate = vi.fn();
  const view = render(<Harness store={store} onActivate={onActivate} {...options} />);
  const option = (name: string) => screen.getByRole('option', { name });
  return { store, onActivate, option, view };
}

const selection = (store: CanvasEditorStoreApi) => store.getState().selectedLayerIds;

describe('LayersSection', () => {
  it('nennt die Elemente vorderstes zuerst', async () => {
    const { view } = setup();
    const listbox = screen.getByRole('listbox', { name: 'Ebenen' });
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Form: Herz',
      'Form: Stern',
      'Form: Kreis',
    ]);
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('hat einen einzigen Tab-Halt', () => {
    const { option } = setup();
    expect(option('Form: Herz')).toHaveAttribute('tabindex', '0');
    expect(option('Form: Stern')).toHaveAttribute('tabindex', '-1');
  });

  it('wählt mit Pfeil runter das nächste Element im Store aus', () => {
    const { store, option } = setup();
    option('Form: Herz').focus();
    fireEvent.keyDown(option('Form: Herz'), { key: 'ArrowDown' });
    expect(selection(store)).toEqual(['stern']);
    expect(option('Form: Stern')).toHaveFocus();
    expect(option('Form: Stern')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(option('Form: Stern'), { key: 'End' });
    expect(selection(store)).toEqual(['kreis']);
  });

  it('zeigt eine Auswahl von der Fläche an und setzt den Tab-Halt dorthin', () => {
    const { store, option } = setup();
    act(() => store.getState().setSelectedElement('kreis'));
    expect(option('Form: Kreis')).toHaveAttribute('aria-selected', 'true');
    expect(option('Form: Herz')).toHaveAttribute('aria-selected', 'false');
    expect(option('Form: Kreis')).toHaveAttribute('tabindex', '0');
  });

  it('nimmt mit Umschalt+Pfeil dazu und schaltet mit Leertaste und Strg-Klick um', () => {
    const { store, option } = setup();
    fireEvent.click(option('Form: Herz'));
    fireEvent.keyDown(option('Form: Herz'), { key: 'ArrowDown', shiftKey: true });
    expect(selection(store)).toEqual(['herz', 'stern']);
    fireEvent.keyDown(option('Form: Stern'), { key: ' ' });
    expect(selection(store)).toEqual(['herz']);
    fireEvent.click(option('Form: Kreis'), { ctrlKey: true });
    expect(selection(store)).toEqual(['herz', 'kreis']);
  });

  it('bewegt mit Strg+Pfeil nur den Fokus', () => {
    const { store, option } = setup();
    fireEvent.click(option('Form: Herz'));
    fireEvent.keyDown(option('Form: Herz'), { key: 'ArrowDown', ctrlKey: true });
    expect(option('Form: Stern')).toHaveFocus();
    expect(selection(store)).toEqual(['herz']);
  });

  it('löscht mit Entf über die Tastatur der Seite', () => {
    const { store, option } = setup();
    fireEvent.click(option('Form: Stern'));
    option('Form: Stern').focus();
    fireEvent.keyDown(option('Form: Stern'), { key: 'Delete' });
    expect(screen.queryByRole('option', { name: 'Form: Stern' })).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(selection(store)).toEqual([]);
  });

  it('gibt den Fokus nach Entf an den nächsten Eintrag', () => {
    const { option } = setup();
    fireEvent.click(option('Form: Stern'));
    option('Form: Stern').focus();
    fireEvent.keyDown(option('Form: Stern'), { key: 'Delete' });
    expect(option('Form: Kreis')).toHaveFocus();
  });

  it('nimmt nach dem untersten Eintrag den vorigen', () => {
    const { option } = setup();
    fireEvent.click(option('Form: Kreis'));
    option('Form: Kreis').focus();
    fireEvent.keyDown(option('Form: Kreis'), { key: 'Delete' });
    expect(option('Form: Stern')).toHaveFocus();
  });

  it('fokussiert die leere Liste, wenn nichts mehr da ist', () => {
    const { option } = setup();
    fireEvent.click(option('Form: Herz'));
    fireEvent.click(option('Form: Stern'), { ctrlKey: true });
    fireEvent.click(option('Form: Kreis'), { ctrlKey: true });
    option('Form: Kreis').focus();
    fireEvent.keyDown(option('Form: Kreis'), { key: 'Delete' });
    expect(screen.getByText('Auf dieser Seite liegen keine Elemente.')).toHaveFocus();
  });

  it('bearbeitet mit Enter und F2 genau einmal', () => {
    const { onActivate, option } = setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    fireEvent.keyDown(option('Form: Stern'), { key: 'Enter' });
    fireEvent.keyDown(option('Form: Stern'), { key: 'F2' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onActivate).toHaveBeenNthCalledWith(1, 'stern');
    expect(onActivate).toHaveBeenNthCalledWith(2, 'stern');
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('nimmt den Fokus, wenn der Sprunglink ihn anfordert — auf die Auswahl', () => {
    const store = createCanvasEditorStore();
    store.getState().setSelectedElement('stern');
    render(<Harness store={store} onActivate={() => {}} focusRequested />);
    expect(screen.getByRole('option', { name: 'Form: Stern' })).toHaveFocus();
  });
});
