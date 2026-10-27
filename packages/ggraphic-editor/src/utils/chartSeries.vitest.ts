// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  addChartRow,
  addChartSeries,
  chartLegendPosition,
  chartSeries,
  createChartInstance,
  removeChartRow,
  removeChartSeries,
  renameChartSeries,
  setChartValue,
  type ChartInstance,
} from '@ggraphic/editor/utils/chartUtils';

const base = (): ChartInstance => ({
  ...createChartInstance('bar', 1920, 1080),
  data: [
    { name: 'A', value: 1 },
    { name: 'B', value: 2 },
  ],
});

describe('chart series', () => {
  it('keeps data on the first series while series are added and edited', () => {
    let chart = { ...base(), ...addChartSeries(base()) };
    expect(chart.series).toEqual([
      { name: 'Reihe 1', values: [1, 2] },
      { name: 'Reihe 2', values: [0, 0] },
    ]);
    chart = { ...chart, ...setChartValue(chart, 1, 1, 7) };
    chart = { ...chart, ...setChartValue(chart, 0, 0, 5) };
    chart = { ...chart, ...renameChartSeries(chart, 1, '2025') };
    expect(chart.data).toEqual([
      { name: 'A', value: 5 },
      { name: 'B', value: 2 },
    ]);
    expect(chart.series).toEqual([
      { name: 'Reihe 1', values: [5, 2] },
      { name: '2025', values: [0, 7] },
    ]);
  });

  it('adds and removes a category in every series', () => {
    const two = { ...base(), ...addChartSeries(base()) };
    const added = { ...two, ...addChartRow(two, 'C') };
    expect(added.data.map((d) => d.name)).toEqual(['A', 'B', 'C']);
    expect(added.series?.map((s) => s.values)).toEqual([
      [1, 2, 0],
      [0, 0, 0],
    ]);
    const removed = { ...added, ...removeChartRow(added, 0) };
    expect(removed.data).toEqual([
      { name: 'B', value: 2 },
      { name: 'C', value: 0 },
    ]);
    expect(removed.series?.map((s) => s.values)).toEqual([
      [2, 0],
      [0, 0],
    ]);
  });

  it('falls back to one series, stored as none, when the first one is removed', () => {
    const two = { ...base(), ...addChartSeries(base()) };
    const one = { ...two, ...setChartValue(two, 0, 1, 9) };
    const left = { ...one, ...removeChartSeries(one, 0) };
    expect(left.series).toEqual([]);
    expect(left.data).toEqual([
      { name: 'A', value: 9 },
      { name: 'B', value: 0 },
    ]);
    expect(chartSeries(left)).toBeNull();
  });

  it('draws series on cartesian charts only and places the legend per type', () => {
    const two = { ...base(), ...addChartSeries(base()) };
    expect(chartSeries(two)).toHaveLength(2);
    expect(chartSeries({ ...two, chartType: 'pie' })).toBeNull();
    expect(chartLegendPosition(two)).toBe('bottom');
    expect(chartLegendPosition({ ...two, chartType: 'donut' })).toBe('right');
    expect(chartLegendPosition({ ...two, chartType: 'pie', legendPosition: 'bottom' })).toBe(
      'bottom'
    );
  });
});
