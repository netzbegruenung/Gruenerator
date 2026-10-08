/**
 * A bar is as wide as its text, so a long line typed into any bar group can
 * run past the canvas edge — and the export cuts it off. Every group's text
 * edit fits it back in, not only the Dreizeilen primary.
 */
import { describe, expect, it } from 'vitest';

import { balkenExtent } from '../../utils/balkenBounds';
import { dreizeilenFullConfig } from '../dreizeilen_full.config';
import { veranstaltungFullConfig } from '../veranstaltung_full.config';

import type { BalkenInstance } from '../../primitives/BalkenGroup';
import type { FullCanvasConfig } from '../types';

const LONG = 'Mehr Windräder für saubere Energie';

function canvasWith<S extends { balkenInstances: BalkenInstance[] }>(
  // Boundary: the configs type their actions as Record<string, any>.
  config: FullCanvasConfig<S, Record<string, unknown>>
) {
  let state = config.createInitialState({});
  const setState = (u: Partial<S> | ((prev: S) => S)) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const noop = () => {};
  const actions = config.createActions(() => state, setState, noop, noop, {}) as {
    addBalken: (mode: 'single' | 'triple') => void;
    updateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
    setBalkenText: (id: string, index: number, text: string) => void;
  };
  actions.addBalken('single');
  const added = () => state.balkenInstances[state.balkenInstances.length - 1]!;
  const extent = () => balkenExtent(added(), config.canvas.width, config.canvas.height);
  return { actions, added, extent, width: config.canvas.width };
}

const CASES = [
  ['a decorative bar on Dreizeilen', dreizeilenFullConfig],
  ['a bar on Veranstaltung', veranstaltungFullConfig],
] as const;

describe.each(CASES)('%s', (_name, config) => {
  it('fits back in when a typed line pushes it off the canvas', () => {
    const c = canvasWith(
      config as unknown as FullCanvasConfig<
        { balkenInstances: BalkenInstance[] },
        Record<string, unknown>
      >
    );
    c.actions.setBalkenText(c.added().id, 0, LONG);
    expect(c.added().texts[0]).toBe(LONG);
    expect(c.extent().left).toBeGreaterThanOrEqual(0);
    expect(c.extent().right).toBeLessThanOrEqual(c.width);
  });

  it('leaves a bar dragged off the edge alone while typing', () => {
    const c = canvasWith(
      config as unknown as FullCanvasConfig<
        { balkenInstances: BalkenInstance[] },
        Record<string, unknown>
      >
    );
    c.actions.updateBalken(c.added().id, { offset: { x: 900, y: 0 } });
    c.actions.setBalkenText(c.added().id, 0, 'GRÜNE jetzt');
    expect(c.added().offset).toEqual({ x: 900, y: 0 });
    expect(c.added().scale).toBe(1);
  });
});
