import { describe, expect, it, vi } from 'vitest';

import {
  createAssetActions,
  createChartActions,
  createFrameActions,
  createShapeActions,
} from '@ggraphic/editor/configs/factory/actionFactories';

import { balkenExtent } from '../../utils/balkenBounds';

import { createBalkenActions } from './balkenActions';

import type { BalkenInstance } from '@ggraphic/editor/utils/balkenUtils';
import type { AssetInstance } from '@ggraphic/editor/utils/canvasAssets';
import type { ChartInstance } from '@ggraphic/editor/utils/chartUtils';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';

/**
 * An Elemente tile dropped on the page lands centred on the drop point; a click
 * still puts it in the canvas centre. Each instance kind stores its position
 * differently (centre, top-left, group offset), so each is checked.
 */
interface PlacementState {
  assetInstances: AssetInstance[];
  shapeInstances: ShapeInstance[];
  chartInstances: ChartInstance[];
  frameInstances: FrameInstance[];
  balkenInstances: BalkenInstance[];
}

const W = 1080;
const H = 1350;
const DROP = { x: 200, y: 900 };

function harness() {
  let state: PlacementState = {
    assetInstances: [],
    shapeInstances: [],
    chartInstances: [],
    frameInstances: [],
    balkenInstances: [],
  };
  const getState = () => state;
  const setState = (
    partial: Partial<PlacementState> | ((prev: PlacementState) => PlacementState)
  ) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
  };
  const args = [getState, setState, vi.fn(), vi.fn(), W, H] as const;
  return {
    current: getState,
    ...createAssetActions(...args),
    ...createShapeActions(...args),
    ...createChartActions(...args),
    ...createFrameActions(...args),
    ...createBalkenActions(...args),
  };
}

describe('placement of added elements', () => {
  it('centres an asset on the drop point, else on the canvas', () => {
    const h = harness();
    h.addAsset('sonnenblume-gelb', { center: DROP });
    h.addAsset('sonnenblume-gelb');
    expect(h.current().assetInstances[0]).toMatchObject(DROP);
    expect(h.current().assetInstances[1]).toMatchObject({ x: W / 2, y: H / 2 });
  });

  it('centres a shape on the drop point and keeps an explicit colour', () => {
    const h = harness();
    h.addShape('rect', '#ff0000', { center: DROP });
    h.addShape('rect');
    expect(h.current().shapeInstances[0]).toMatchObject({ ...DROP, fill: '#ff0000' });
    expect(h.current().shapeInstances[1]).toMatchObject({ x: W / 2, y: H / 2 });
  });

  it('centres a chart, which stores its top-left corner', () => {
    const h = harness();
    h.addChart('bar', { center: DROP });
    const chart = h.current().chartInstances[0];
    expect(chart.x + chart.width / 2).toBe(DROP.x);
    expect(chart.y + chart.height / 2).toBe(DROP.y);
  });

  it('centres a frame on the drop point', () => {
    const h = harness();
    h.addFrame('circle', { center: DROP });
    expect(h.current().frameInstances[0]).toMatchObject(DROP);
  });

  it('moves a balken group so its bars are centred on the drop point', () => {
    const h = harness();
    h.addBalken('triple', { center: DROP });
    h.addBalken('single');
    const [dropped, clicked] = h.current().balkenInstances;
    const box = balkenExtent(dropped, W, H);
    expect((box.left + box.right) / 2).toBeCloseTo(DROP.x);
    expect((box.top + box.bottom) / 2).toBeCloseTo(DROP.y);
    expect(clicked.offset).toEqual({ x: 0, y: 0 });
  });
});
