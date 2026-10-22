/**
 * Neu eingefügte Elemente: auf Sharepics genau die bisherigen Werte, auf einer
 * 1920 × 1080-Folie mit der Breite gewachsen und um die Seitenmitte gelegt.
 */
import { describe, expect, it, vi } from 'vitest';

import { getCanvasFormatOrDefault, insertScaleFor } from '../formats';

import { createFreeformFullConfig, type FreeformState } from './freeform_full.config';

import type { ChartType } from '../utils/chartUtils';
import type { ShapeType } from '../utils/shapes';

/** Die Einfüge-Türen, die der Test ruft (`FreeformActions` ist untypisiert). */
interface InsertActions {
  addHeader: () => void;
  addSubheader: () => void;
  addText: () => void;
  addShape: (type: ShapeType) => void;
  addAsset: (assetId: string) => void;
  toggleIcon: (id: string, selected: boolean) => void;
  addChart: (type: ChartType) => void;
}

function harness(formatId: string) {
  const format = getCanvasFormatOrDefault(formatId);
  const config = createFreeformFullConfig(format);
  let state = config.createInitialState({}) as FreeformState;
  const actions = config.createActions(
    () => state,
    (partial) => {
      state =
        typeof partial === 'function'
          ? (partial as (prev: FreeformState) => FreeformState)(state)
          : { ...state, ...partial };
    },
    vi.fn(),
    vi.fn(),
    {}
  ) as InsertActions;
  return { actions, current: () => state, format };
}

describe('insertion defaults per format', () => {
  it('keeps the sharepic values on post-portrait', () => {
    const { actions, current } = harness('post-portrait');
    actions.addHeader();
    actions.addSubheader();
    actions.addText();
    actions.addShape('rect');
    actions.addAsset('sunflower');
    actions.toggleIcon('tabler:leaf', true);
    actions.addChart('bar');
    const s = current();
    expect(s.additionalTexts.map((t) => [t.fontSize, t.width, t.x, t.y])).toEqual([
      [48, 400, 340, 450],
      [36, 400, 340, 540],
      [32, 400, 340, 675],
    ]);
    expect(s.shapeInstances[0]).toMatchObject({ x: 540, y: 675, width: 300, height: 300 });
    expect(s.assetInstances[0]).toMatchObject({ x: 540, y: 675, scale: 1 });
    expect(s.iconStates['tabler:leaf']).toMatchObject({ x: 540, y: 675, scale: 1 });
    expect(s.chartInstances[0]).toMatchObject({ x: 300, y: 515, width: 480, scale: 1 });
  });

  it('grows them with the width on a 16:9 slide', () => {
    const { actions, current, format } = harness('slide-16-9');
    const k = insertScaleFor(format);
    expect(k).toBeCloseTo(1920 / 1080);
    actions.addHeader();
    actions.addText();
    actions.addShape('rect');
    actions.addAsset('sunflower');
    actions.toggleIcon('tabler:leaf', true);
    actions.addChart('bar');
    const s = current();
    const [header, body] = s.additionalTexts;
    expect(header!.fontSize).toBeCloseTo(48 * k);
    expect(header!.width).toBeCloseTo(400 * k);
    expect(header!.x + header!.width / 2).toBeCloseTo(960);
    expect(body!.fontSize).toBeCloseTo(32 * k);
    expect(s.shapeInstances[0]!.width).toBeCloseTo(300 * k);
    expect(s.assetInstances[0]!.scale).toBeCloseTo(k);
    expect(s.iconStates['tabler:leaf']!.scale).toBeCloseTo(k);
    const chart = s.chartInstances[0]!;
    expect(chart.scale).toBeCloseTo(k);
    expect(chart.x + (chart.width * k) / 2).toBeCloseTo(960);
    expect(chart.y + (chart.height * k) / 2).toBeCloseTo(540);
  });

  it('leaves every non-slide format at 1', () => {
    for (const id of ['post-portrait', 'post-portrait-tall', 'print-a3-hoch']) {
      expect(insertScaleFor(getCanvasFormatOrDefault(id))).toBe(1);
    }
  });
});
