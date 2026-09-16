import { describe, expect, it, vi } from 'vitest';

import { createBalkenActions, createIllustrationActions } from './actionFactories';

import type { BalkenInstance } from '../../utils/balkenUtils';
import type { IllustrationInstance } from '../../utils/illustrations/types';

/**
 * Die beiden Seitenleisten-Aktionen laufen durch dieselbe Tür wie Strg+D
 * (`duplicateElementInState`). Geprüft wird hier nicht das Kopieren selbst —
 * das tut `utils/duplicateElement.vitest.ts` —, sondern die Verdrahtung:
 * findet die Tür nichts, darf auch nichts in den Verlauf.
 */
function harness<TState extends object>(initial: TState) {
  let state = initial;
  const saveToHistory = vi.fn();
  const debounced = vi.fn();
  const setState = (partial: Partial<TState> | ((prev: TState) => TState)) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
  };
  return {
    getState: () => state,
    setState,
    saveToHistory,
    debounced,
    current: () => state,
  };
}

const illustrationState = () => ({
  illustrationInstances: [{ id: 'ill-1', x: 10, y: 20 }] as unknown as IllustrationInstance[],
  layerOrder: ['ill-1'],
});

const balkenState = () => ({
  balkenInstances: [
    { id: 'balken-1', offset: { x: 10, y: 20 }, texts: ['GRÜNE'] },
  ] as unknown as BalkenInstance[],
  layerOrder: ['balken-1'],
});

describe('duplicateIllustration', () => {
  it('legt die Kopie ab und schreibt den Zustand samt Kopie in den Verlauf', () => {
    const h = harness(illustrationState());
    const actions = createIllustrationActions(
      h.getState,
      h.setState,
      h.saveToHistory,
      h.debounced,
      1080,
      1080
    );

    actions.duplicateIllustration('ill-1');

    expect(h.current().illustrationInstances).toHaveLength(2);
    expect(h.saveToHistory).toHaveBeenCalledTimes(1);
    const saved = h.saveToHistory.mock.calls[0][0] as ReturnType<typeof illustrationState>;
    expect(saved.illustrationInstances).toHaveLength(2);
  });

  /**
   * Der eigentliche Grund für diesen Test: solange der Verlaufseintrag
   * unbedingt geschrieben wurde, legte eine ID, die nirgends steht, einen
   * leeren Schritt auf den Rückgängig-Stapel — ein Strg+Z, das nichts tut.
   */
  it('schreibt keinen Verlaufseintrag für eine unbekannte ID', () => {
    const h = harness(illustrationState());
    const actions = createIllustrationActions(
      h.getState,
      h.setState,
      h.saveToHistory,
      h.debounced,
      1080,
      1080
    );

    actions.duplicateIllustration('gibt-es-nicht');

    expect(h.current().illustrationInstances).toHaveLength(1);
    expect(h.saveToHistory).not.toHaveBeenCalled();
  });
});

describe('duplicateBalken', () => {
  it('legt die Kopie ab und schreibt den Zustand samt Kopie in den Verlauf', () => {
    const h = harness(balkenState());
    const actions = createBalkenActions(h.getState, h.setState, h.saveToHistory, h.debounced);

    actions.duplicateBalken('balken-1');

    expect(h.current().balkenInstances).toHaveLength(2);
    expect(h.saveToHistory).toHaveBeenCalledTimes(1);
  });

  it('schreibt keinen Verlaufseintrag für eine unbekannte ID', () => {
    const h = harness(balkenState());
    const actions = createBalkenActions(h.getState, h.setState, h.saveToHistory, h.debounced);

    actions.duplicateBalken('gibt-es-nicht');

    expect(h.current().balkenInstances).toHaveLength(1);
    expect(h.saveToHistory).not.toHaveBeenCalled();
  });
});
