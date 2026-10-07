/**
 * The op path on a Dreizeilen template canvas (#4259): the model has to SEE
 * the bar group under its live id, and size and position ops have to land —
 * live every one of them came back "Element lässt sich hier nicht verändern".
 */
import { describe, expect, it } from 'vitest';

import { type DreizeilenFullState } from '../configs/dreizeilen.types';
import { dreizeilenFullConfig } from '../configs/dreizeilen_full.config';

import { applyOperation } from './applyOperation';

function dreizeilen() {
  let state = dreizeilenFullConfig.createInitialState({
    line1: 'Mehr Radwege',
    line2: 'für alle',
    line3: 'jetzt',
    fontSize: 80,
    balkenScale: 1.2,
  });
  const getState = () => state;
  const setState = (
    u: Partial<DreizeilenFullState> | ((prev: DreizeilenFullState) => DreizeilenFullState)
  ) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const actions = dreizeilenFullConfig.createActions(getState, setState, noop, noop, {});
  return { ai: dreizeilenFullConfig.ai!, actions, getState };
}

describe('dreizeilen op path', () => {
  it('shows the bar group under its live id, with size and opacity, and the font size', () => {
    const { ai, getState } = dreizeilen();
    const snap = ai.describeForAi(getState());
    const balken = snap.elementsSummary.find((e) => e.id === 'dreizeilen-balken');
    expect(balken).toMatchObject({ kind: 'balken' });
    expect(balken!.label).toContain('x=0, y=0');
    expect(balken!.label).toContain('Größe 1.2');
    expect(balken!.label).toContain('Transparenz 100%');
    expect(snap.textFields[0]!.label).toContain('80px');
    expect(snap.elementsSummary.map((e) => e.id)).not.toContain('balken');
  });

  it('applies set-font-size, clamped to the template range', () => {
    const { ai, actions, getState } = dreizeilen();
    expect(ai.supportedOperations).toContain('set-font-size');
    const op = { kind: 'set-font-size', field: 'line2', label: 'Zweite Zeile', size: 200 } as const;
    expect(applyOperation(op, actions, getState, ai)).toEqual({ ok: true });
    expect(getState().fontSize).toBe(120);
    // The bars draw their text at a fixed size: the group's scale makes it larger (80 → 120).
    expect(getState().balkenScale).toBeCloseTo(1.8);
  });

  it('moves the bar group up and scales it relative to its size', () => {
    const { ai, actions, getState } = dreizeilen();
    const result = applyOperation(
      { kind: 'update-element', elementId: 'dreizeilen-balken', patch: { y: -120, scale: 0.8 } },
      actions,
      getState,
      ai
    );
    expect(result).toEqual({ ok: true });
    expect(getState().balkenOffset).toEqual({ x: 0, y: -120 });
    expect(getState().balkenScale).toBeCloseTo(0.96);
  });
});
