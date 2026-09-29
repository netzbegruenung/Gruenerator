/**
 * Charts und Badges bekommen Formatierungsknöpfe (#3870).
 *
 * Alle drei sind auswählbar, fielen aber durch jeden Zweig von
 * `useFloatingModuleState` — ohne Modul zeigt die Kontextleiste nur die
 * Ebenen-Knöpfe. Der schärfste Fall steht zuerst: der Datumskreis der
 * Veranstaltung, gegen die echte Config und ihre echten Actions.
 */
import { render, renderHook, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ContextControls } from '../../components/TopBar/ContextControls';
import { loadCanvasConfig } from '../../configs/configLoader';
import { useFloatingModuleHandlers } from '../useFloatingModuleHandlers';
import { useFloatingModuleState } from '../useFloatingModuleState';

import type { FullCanvasConfig, LayoutResult } from '../../configs/types';
import type { OptionalCanvasActions } from '../useCanvasElementHandlers';

type State = Record<string, unknown>;
type AnyConfig = FullCanvasConfig<State, OptionalCanvasActions>;

let veranstaltung: AnyConfig;

// `loadCanvasConfig` zieht die ganze Config-Kette per dynamischem Import — das
// sprengt auf einem ausgelasteten Runner die 5-s-Grenze des Testkörpers.
beforeAll(async () => {
  veranstaltung = (await loadCanvasConfig('veranstaltung')) as unknown as AnyConfig;
}, 120_000);

function resolveModule(selectedElement: string, state: State, config: AnyConfig) {
  return renderHook(() =>
    useFloatingModuleState({ selectedElement, config, state, layout: {} as LayoutResult })
  ).result.current;
}

function handlersFor(
  selectedElement: string,
  state: State,
  config: AnyConfig,
  actions: OptionalCanvasActions
) {
  const activeFloatingModule = resolveModule(selectedElement, state, config);
  return renderHook(() =>
    useFloatingModuleHandlers({
      activeFloatingModule,
      actions,
      config,
      state,
      setState: () => {},
      debouncedSaveToHistory: () => {},
    })
  ).result.current;
}

describe('veranstaltung date circle', () => {
  function liveCanvas() {
    let state = veranstaltung.createInitialState({}) as State;
    const setState = (partial: Partial<State> | ((prev: State) => State)) => {
      state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
    };
    const actions = veranstaltung.createActions(
      () => state,
      setState,
      () => {},
      () => {},
      {}
    );
    return { getState: () => state, actions };
  }

  const circleOf = (state: State) =>
    (state.circleBadgeInstances as Array<Record<string, unknown>>).find(
      (c) => c.id === 'date-circle'
    );

  it('resolves to a circle-badge module carrying its colour and opacity', () => {
    const { getState } = liveCanvas();
    const circle = circleOf(getState());

    expect(resolveModule('date-circle', getState(), veranstaltung)).toEqual({
      type: 'circle-badge',
      data: { id: 'date-circle', fill: circle?.backgroundColor, opacity: 1 },
    });
  });

  it('colour and opacity changes land on the circle', () => {
    const canvas = liveCanvas();
    const handlers = handlersFor('date-circle', canvas.getState(), veranstaltung, canvas.actions);

    handlers.handleColorSelect('#E6007E');
    handlers.handleOpacityChange('date-circle', 0.4, 'circle-badge');

    expect(circleOf(canvas.getState())).toMatchObject({
      backgroundColor: '#E6007E',
      opacity: 0.4,
    });
  });

  it('shows a colour swatch and the opacity slider in the context bar', () => {
    const { getState } = liveCanvas();
    render(
      <ContextControls
        selectedElement="date-circle"
        activeFloatingModule={resolveModule('date-circle', getState(), veranstaltung)}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={{
          handleMoveLayer: () => {},
          handleDuplicate: () => {},
          handleColorSelect: () => {},
          handleOpacityChange: () => {},
          handleFontSizeChange: () => {},
        }}
      />
    );

    expect(screen.getByLabelText('Farbpalette öffnen')).toBeInTheDocument();
    expect(screen.getByLabelText('Opacity')).toBeInTheDocument();
  });
});

describe('pill badge and chart', () => {
  const config = { elements: [] } as unknown as AnyConfig;
  const state: State = {
    pillBadgeInstances: [{ id: 'pill-1', backgroundColor: '#005538', opacity: 0.8 }],
    chartInstances: [{ id: 'chart-1', opacity: 0.5, colors: ['#005538'] }],
  };

  it('pill badge exposes background colour and opacity', () => {
    expect(resolveModule('pill-1', state, config)).toEqual({
      type: 'pill-badge',
      data: { id: 'pill-1', fill: '#005538', opacity: 0.8 },
    });

    const updatePillBadge = vi.fn();
    const handlers = handlersFor('pill-1', state, config, { updatePillBadge });
    handlers.handleColorSelect('#8ABD24');
    handlers.handleOpacityChange('pill-1', 0.3, 'pill-badge');

    expect(updatePillBadge.mock.calls).toEqual([
      ['pill-1', { backgroundColor: '#8ABD24' }],
      ['pill-1', { opacity: 0.3 }],
    ]);
  });

  it('chart exposes opacity only — series colours stay in chart-settings', () => {
    expect(resolveModule('chart-1', state, config)).toEqual({
      type: 'chart',
      data: { id: 'chart-1', opacity: 0.5 },
    });

    const updateChart = vi.fn();
    const handlers = handlersFor('chart-1', state, config, { updateChart });
    handlers.handleOpacityChange('chart-1', 0.9, 'chart');

    expect(updateChart).toHaveBeenCalledWith('chart-1', { opacity: 0.9 });
  });
});
