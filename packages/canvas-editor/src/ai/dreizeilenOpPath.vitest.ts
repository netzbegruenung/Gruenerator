/**
 * The op path on a Dreizeilen template canvas (#4259): the model has to SEE
 * the bar group under its live id, and size and position ops have to land —
 * live every one of them came back "Element lässt sich hier nicht verändern".
 */
import { describe, expect, it } from 'vitest';

import { type DreizeilenFullState } from '../configs/dreizeilen.types';
import { dreizeilenFullConfig } from '../configs/dreizeilen_full.config';
import { balkenExtent } from '../utils/balkenBounds';

import { applyOperation } from './applyOperation';

function dreizeilen(lines = { line1: 'Mehr Radwege', line2: 'für alle', line3: 'jetzt' }) {
  let state = dreizeilenFullConfig.createInitialState({
    ...lines,
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
    // Studio scale is a factor on the current size; the shared label read like a target value.
    expect(balken!.label).toContain(
      'Größe 1.2 ("scale" ist ein Faktor darauf, z. B. 0.8 = 20 % kleiner; Ergebnis 0.5..2)'
    );
    expect(balken!.label).not.toContain('(erlaubt: 0.5..2)');
    expect(balken!.label).toContain('Transparenz 100%');
    expect(snap.textFields[0]!.label).toContain('80px');
    expect(snap.elementsSummary.map((e) => e.id)).not.toContain('balken');
  });

  it('applies set-font-size, clamped to the template range', () => {
    // Short lines, so the group still fits the canvas at 1.8.
    const { ai, actions, getState } = dreizeilen({
      line1: 'Radwege',
      line2: 'jetzt',
      line3: 'mehr',
    });
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

  it('keeps a relative scale inside the template range', () => {
    const { ai, actions, getState } = dreizeilen({ line1: 'A', line2: 'B', line3: 'C' });
    const scale = (factor: number) =>
      applyOperation(
        { kind: 'update-element', elementId: 'dreizeilen-balken', patch: { scale: factor } },
        actions,
        getState,
        ai
      );
    expect(scale(0.2)).toEqual({ ok: true });
    expect(getState().balkenScale).toBe(0.5);
    expect(scale(10)).toEqual({ ok: true });
    expect(getState().balkenScale).toBeLessThanOrEqual(2);
  });
});

/**
 * #4263: the bar group is scaled around its centre, and its width follows the
 * longest line — a later `set-text` can push a scaled-up group off the canvas.
 * The canvas hands both the AI bridge and the actions its render-time state,
 * so the bound has to be checked on the state the batch left behind.
 */
describe('dreizeilen bar group stays on the canvas', () => {
  const MARGIN = 20;

  function renderTimeCanvas() {
    let state = dreizeilenFullConfig.createInitialState({
      line1: 'Mehr Radwege',
      line2: 'für alle',
      line3: 'jetzt',
      fontSize: 80,
      balkenScale: 1.2,
    });
    const rendered = state;
    const setState = (
      u: Partial<DreizeilenFullState> | ((prev: DreizeilenFullState) => DreizeilenFullState)
    ) => {
      state = typeof u === 'function' ? u(state) : { ...state, ...u };
    };
    const noop = () => {};
    const actions = dreizeilenFullConfig.createActions(() => rendered, setState, noop, noop, {});
    const applyBatch = (ops: Parameters<typeof applyOperation>[0][]) =>
      ops.map((op) => applyOperation(op, actions, () => rendered, dreizeilenFullConfig.ai!));
    return { applyBatch, getState: () => state };
  }

  const primary = (state: DreizeilenFullState) =>
    state.balkenInstances.find((b) => b.id === 'dreizeilen-balken')!;

  function expectInside(state: DreizeilenFullState) {
    const e = balkenExtent(primary(state), 1080, 1350);
    expect(e.left).toBeGreaterThanOrEqual(MARGIN - 0.01);
    expect(e.right).toBeLessThanOrEqual(1080 - MARGIN + 0.01);
    expect(e.top).toBeGreaterThanOrEqual(MARGIN - 0.01);
    expect(e.bottom).toBeLessThanOrEqual(1350 - MARGIN + 0.01);
  }

  it('pulls a scaled-up group back in when a later set-text makes a line longer', () => {
    const { applyBatch, getState } = renderTimeCanvas();
    applyBatch([{ kind: 'set-font-size', field: 'line2', label: 'Zweite Zeile', size: 120 }]);
    const results = applyBatch([
      { kind: 'set-text', field: 'line2', label: 'Zweite Zeile', value: 'für Musterstadt' },
      { kind: 'set-text', field: 'line3', label: 'Dritte Zeile', value: 'SIND DA' },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(getState().line2).toBe('für Musterstadt');
    expectInside(getState());
    // Too wide for the canvas at 1.8: the scale gives way, but no further than needed.
    expect(getState().balkenScale).toBeLessThan(1.8);
    expect(getState().balkenScale).toBeGreaterThan(1.3);
  });

  it('shifts the group back instead of shrinking it when it only sits too far out', () => {
    const { applyBatch, getState } = renderTimeCanvas();
    applyBatch([
      { kind: 'update-element', elementId: 'dreizeilen-balken', patch: { x: -400, y: 500 } },
    ]);
    expectInside(getState());
    expect(getState().balkenScale).toBe(1.2);
  });

  it('leaves a group that fits alone', () => {
    const { applyBatch, getState } = renderTimeCanvas();
    const before = getState();
    applyBatch([{ kind: 'set-text', field: 'line1', label: 'Erste Zeile', value: 'Mehr Bäume' }]);
    expect(getState().balkenScale).toBe(before.balkenScale);
    expect(getState().balkenOffset).toEqual(before.balkenOffset);
  });
});
