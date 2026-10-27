import { buildChartElement } from '@ggraphic/editor/primitives/ChartPrimitive';
import { createChartInstance, type ChartInstance } from '@ggraphic/editor/utils/chartUtils';
import { render } from '@testing-library/react';
import * as recharts from 'recharts';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const GLYPH = 8;

const multi = (): ChartInstance => ({
  ...createChartInstance('bar', 1920, 1080),
  width: 480,
  height: 320,
  data: [
    { name: 'K1', value: 4 },
    { name: 'K2', value: 2 },
  ],
  series: [
    { name: 'Reihe 1', values: [4, 2] },
    { name: 'Reihe 2', values: [1, 3] },
    { name: 'Reihe 3', values: [2, 5] },
  ],
  colors: ['#111111', '#222222', '#333333'],
  showLegend: true,
});

/** Legend entries: the swatch's fill and the text beside it. */
const legendOf = (container: HTMLElement) =>
  [...container.querySelectorAll('g[transform^="translate"] > rect[rx="3"]')].map((rect) => ({
    fill: rect.getAttribute('fill'),
    name: rect.nextElementSibling?.textContent,
    transform: rect.parentElement!.getAttribute('transform')!,
  }));

describe('ChartPrimitive — several series (#4870)', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * GLYPH }),
    } as unknown as CanvasRenderingContext2D);
  });

  it('draws one bar group per series and a legend row below the chart', () => {
    const { container } = render(buildChartElement(recharts, multi()));
    const bars = [...container.querySelectorAll('.recharts-bar-rectangle path')];
    expect(bars).toHaveLength(6);
    expect(new Set(bars.map((b) => b.getAttribute('fill')))).toEqual(
      new Set(['#111111', '#222222', '#333333'])
    );
    const legend = legendOf(container);
    expect(legend.map((l) => [l.name, l.fill])).toEqual([
      ['Reihe 1', '#111111'],
      ['Reihe 2', '#222222'],
      ['Reihe 3', '#333333'],
    ]);
    // One row, at the bottom edge: every entry at y = 320 - 24.
    expect(new Set(legend.map((l) => l.transform.split(', ')[1]))).toEqual(new Set(['296)']));
  });

  it('puts a pie legend below the pie when asked', () => {
    const pie = { ...multi(), chartType: 'pie' as const, legendPosition: 'bottom' as const };
    const { container } = render(buildChartElement(recharts, pie));
    const legend = legendOf(container);
    expect(legend.map((l) => l.name)).toEqual(['K1', 'K2']);
    expect(new Set(legend.map((l) => l.transform.split(', ')[1]))).toEqual(new Set(['296)']));
  });

  it('keeps value labels of horizontal bars clear of a legend on the right', () => {
    const chart: ChartInstance = {
      ...multi(),
      chartType: 'bar-horizontal',
      legendPosition: 'right',
      showValues: true,
      series: [
        { name: 'Reihe 1', values: [1234567890123, 2] },
        { name: 'Reihe 2', values: [1, 3] },
      ],
    };
    const { container } = render(buildChartElement(recharts, chart));
    const barRight = Math.max(
      ...[...container.querySelectorAll('.recharts-bar-rectangle path')].map(
        (b) => Number(b.getAttribute('x')) + Number(b.getAttribute('width'))
      )
    );
    const legendX = Math.min(
      ...legendOf(container).map((l) => Number(/translate\(([\d.]+)/.exec(l.transform)![1]))
    );
    // A label wider than the legend column (~8.5 px a bold character) fits between bar and legend.
    expect(legendX - barRight).toBeGreaterThanOrEqual('1234567890123'.length * 8.5);
  });

  it('draws no legend for a single cartesian series', () => {
    const single = { ...multi(), series: [] };
    const { container } = render(buildChartElement(recharts, single));
    expect(legendOf(container)).toEqual([]);
  });
});
