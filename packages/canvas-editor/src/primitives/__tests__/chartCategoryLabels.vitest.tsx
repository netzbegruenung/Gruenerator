import { render } from '@testing-library/react';
import * as recharts from 'recharts';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createChartInstance } from '../../utils/chartUtils';
import { buildChartElement } from '../ChartPrimitive';

const RANKING = [
  { name: 'Gas', value: 41 },
  { name: 'Öl', value: 22 },
  { name: 'Holz', value: 18 },
  { name: 'Wärmepumpe', value: 12 },
  { name: 'Fernwärme', value: 7 },
];
/** Wider than the 7.5 px a character the axis was once sized by. */
const GLYPH = 10;

describe('ChartPrimitive — horizontal bar category labels (#4717)', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * GLYPH }),
    } as unknown as CanvasRenderingContext2D);
  });

  it('sizes the category axis by the measured names and labels every bar', () => {
    const chart = { ...createChartInstance('bar-horizontal', 600, 320), data: RANKING };
    const { container } = render(buildChartElement(recharts, chart));
    const ticks = [
      ...container.querySelectorAll('text.recharts-cartesian-axis-tick-value[orientation="left"]'),
    ];
    expect(ticks.map((t) => t.textContent)).toEqual(RANKING.map((d) => d.name));
    const axisWidth = Number(ticks[0]?.getAttribute('width'));
    expect(axisWidth).toBeGreaterThanOrEqual('Wärmepumpe'.length * GLYPH + 12);
  });
});
