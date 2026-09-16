import { describe, expect, it, vi } from 'vitest';

import { createIconActions } from './actionFactories';

import type { IconState } from './baseTypes';

/**
 * Abwählen trifft seit #3404 zwei verschiedene Absichten mit derselben Aktion:
 * aus der Seitenleiste kommt eine Katalog-ID (dort steht je Icon EIN Eintrag,
 * gemeint sind alle Kopien), aus dem Entf-Zweig eine Instanz-ID (gemeint ist
 * genau eine). Beides muss `toggleIcon` auseinanderhalten.
 */
interface IconTestState {
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
}

function harness(initial: IconTestState) {
  let state = initial;
  const setState = (partial: Partial<IconTestState> | ((prev: IconTestState) => IconTestState)) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
  };
  const saveToHistory = vi.fn();
  const actions = createIconActions(() => state, setState, saveToHistory, vi.fn(), 1080, 1080, {
    defaultColor: '#005538',
  });
  return { actions, current: () => state, saveToHistory };
}

const at = (x: number, extra: Partial<IconState> = {}): IconState => ({
  x,
  y: x,
  scale: 1,
  rotation: 0,
  ...extra,
});

const threeSuns = (): IconTestState => ({
  selectedIcons: ['tabler-sun', 'icon-1', 'icon-2'],
  iconStates: {
    'tabler-sun': at(10),
    'icon-1': at(30, { iconId: 'tabler-sun' }),
    'icon-2': at(50, { iconId: 'tabler-sun' }),
  },
});

describe('toggleIcon', () => {
  it('legt das erste Exemplar unter der Katalog-ID ab', () => {
    // Kein `iconId` — genau die Form, in der alle Dokumente von vor #3404
    // vorliegen, und die Auflösung `iconId ?? id` deckt sie mit ab.
    const h = harness({ selectedIcons: [], iconStates: {} });
    h.actions.toggleIcon('tabler-sun', true);

    expect(h.current().selectedIcons).toEqual(['tabler-sun']);
    expect(h.current().iconStates['tabler-sun']).toMatchObject({ x: 540, y: 540, scale: 1 });
    expect(h.current().iconStates['tabler-sun'].iconId).toBeUndefined();
  });

  it('räumt mit der Katalog-ID das Original UND jede Kopie ab', () => {
    const h = harness(threeSuns());
    h.actions.toggleIcon('tabler-sun', false);

    expect(h.current().selectedIcons).toEqual([]);
    expect(h.current().iconStates).toEqual({});
  });

  it('räumt mit einer Instanz-ID nur diese eine ab', () => {
    const h = harness(threeSuns());
    h.actions.toggleIcon('icon-1', false);

    expect(h.current().selectedIcons).toEqual(['tabler-sun', 'icon-2']);
    expect(Object.keys(h.current().iconStates)).toEqual(['tabler-sun', 'icon-2']);
  });

  it('lässt fremde Icons stehen', () => {
    const h = harness({
      selectedIcons: ['tabler-sun', 'tabler-leaf'],
      iconStates: { 'tabler-sun': at(10), 'tabler-leaf': at(20) },
    });
    h.actions.toggleIcon('tabler-sun', false);

    expect(h.current().selectedIcons).toEqual(['tabler-leaf']);
  });
});
