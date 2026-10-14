/**
 * A line typed by hand that pushes the bar group off the canvas pulls it back
 * in, in the same state update as the text (one undo step). A group dragged or
 * scaled off the edge on purpose stays where it is.
 */
import { describe, expect, it } from 'vitest';

import { balkenExtent } from '../../utils/balkenBounds';
import { type DreizeilenFullState } from '../dreizeilen.types';
import { dreizeilenFullConfig } from '../dreizeilen_full.config';

const W = 1080;
const H = 1350;
const LONG = 'Mehr Windräder für saubere Energie';

function dreizeilen() {
  let state = dreizeilenFullConfig.createInitialState({
    line1: 'Mehr Radwege',
    line2: 'für alle',
    line3: 'jetzt',
  });
  let updates = 0;
  const setState = (
    u: Partial<DreizeilenFullState> | ((prev: DreizeilenFullState) => DreizeilenFullState)
  ) => {
    updates++;
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const actions = dreizeilenFullConfig.createActions(() => state, setState, noop, noop, {});
  return { actions, getState: () => state, updates: () => updates };
}

const primary = (state: DreizeilenFullState) =>
  state.balkenInstances.find((b) => b.id === 'dreizeilen-balken')!;

function expectInside(state: DreizeilenFullState) {
  const e = balkenExtent(primary(state), W, H);
  expect(e.left).toBeGreaterThanOrEqual(0);
  expect(e.right).toBeLessThanOrEqual(W);
  expect(e.top).toBeGreaterThanOrEqual(0);
  expect(e.bottom).toBeLessThanOrEqual(H);
}

describe('dreizeilen: fit when typing', () => {
  it('fits the group back in when a typed line pushes it off the canvas, in one update', () => {
    const { actions, getState, updates } = dreizeilen();
    actions.setLine3(LONG);
    expect(updates()).toBe(1);
    expect(getState().line3).toBe(LONG);
    expect(getState().balkenScale).toBeLessThan(1);
    expectInside(getState());
  });

  it('fits on the inline bar editor too', () => {
    const { actions, getState } = dreizeilen();
    actions.setBalkenText('dreizeilen-balken', 2, LONG);
    expectInside(getState());
  });

  it('never fits a drag, and leaves a group dragged off the edge alone while typing', () => {
    const { actions, getState } = dreizeilen();
    actions.updateBalken('dreizeilen-balken', { offset: { x: 700, y: 0 } });
    expect(getState().balkenOffset).toEqual({ x: 700, y: 0 });
    actions.setLine3('jetzt sofort');
    expect(getState().balkenOffset).toEqual({ x: 700, y: 0 });
    expect(getState().balkenScale).toBe(1);
  });
});
