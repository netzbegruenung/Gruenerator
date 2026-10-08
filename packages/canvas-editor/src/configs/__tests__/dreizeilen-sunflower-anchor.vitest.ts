/**
 * Without a saved position the sunflower sits on the bottom-right corner of the
 * bar group the canvas draws — with its scale, offset and fixed font size —
 * not on a block computed some other way (#4289). Its size is unchanged.
 */
import { describe, expect, it } from 'vitest';

import { balkenExtent } from '../../utils/balkenBounds';
import { dreizeilenFullConfig } from '../dreizeilen_full.config';
import { type ImageElementConfig } from '../types';

const W = 1080;
const H = 1350;

const sunflower = dreizeilenFullConfig.elements.find(
  (e) => e.id === 'sunflower'
) as ImageElementConfig<never>;

function placed(props: Record<string, unknown>) {
  const state = dreizeilenFullConfig.createInitialState(props);
  const layout = dreizeilenFullConfig.calculateLayout(state);
  const at = (v: unknown) =>
    typeof v === 'function' ? (v as (...a: unknown[]) => number)(state, layout) : v;
  const box = {
    x: at(sunflower.x) as number,
    y: at(sunflower.y) as number,
    size: at(sunflower.width) as number,
  };
  const primary = state.balkenInstances.find((b) => b.id === 'dreizeilen-balken')!;
  return { box, extent: balkenExtent(primary, W, H) };
}

function expectOnCorner(props: Record<string, unknown>) {
  const { box, extent } = placed(props);
  expect(box.size).toBeCloseTo(184.32);
  expect(box.x).toBeCloseTo(extent.right - 0.6 * box.size);
  expect(box.y).toBeCloseTo(extent.bottom - 0.6 * box.size);
}

describe('Dreizeilen sunflower default position', () => {
  it('follows the drawn group when line 3 is the longest', () => {
    expectOnCorner({ line1: 'Wir', line2: 'sind', line3: 'die Zukunft' });
  });

  it('follows the group scale and offset', () => {
    expectOnCorner({
      line1: 'Mehr Radwege',
      line2: 'für alle',
      line3: 'jetzt',
      balkenScale: 0.6,
      balkenOffset: { x: -150, y: -250 },
    });
  });

  it('keeps a saved position', () => {
    const { box } = placed({ line1: 'a', line2: 'b', line3: 'c', sunflowerPos: { x: 12, y: 34 } });
    expect(box).toMatchObject({ x: 12, y: 34 });
  });
});
