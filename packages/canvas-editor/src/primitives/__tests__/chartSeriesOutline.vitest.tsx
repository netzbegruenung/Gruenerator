import { render } from '@testing-library/react';
import * as recharts from 'recharts';
import { describe, expect, it } from 'vitest';

import { type ChartInstance, createChartInstance } from '../../utils/chartUtils';
import { buildChartElement } from '../ChartPrimitive';

const DARK = '#257639';
const LIGHT = '#FCEC00';

const chartOf = (chartType: ChartInstance['chartType'], background: string | null) => ({
  ...createChartInstance(chartType, 1080, 1350),
  data: [
    { name: 'Dunkel', value: 60 },
    { name: 'Hell', value: 40 },
  ],
  colors: [DARK, LIGHT],
  showValues: false,
  ...(background ? { background } : {}),
});

const strokeOf = (container: HTMLElement, selector: string, fill: string) =>
  [...container.querySelectorAll(selector)]
    .filter((el) => el.getAttribute('fill') === fill)
    .map((el) => el.getAttribute('stroke'));

describe('ChartPrimitive — series outline on a known background (#4284)', () => {
  it('outlines a light pie slice and its legend swatch, not the dark one', () => {
    const { container } = render(buildChartElement(recharts, chartOf('pie', '#FFFFFF')));
    const light = strokeOf(container, 'path', LIGHT);
    expect(light.length).toBeGreaterThan(0);
    expect(light.every((s) => s === DARK)).toBe(true);
    expect(strokeOf(container, 'rect', LIGHT)).toEqual([DARK]);
    expect(strokeOf(container, 'rect', DARK)).not.toContain(DARK);
  });

  it('outlines a light bar', () => {
    const { container } = render(buildChartElement(recharts, chartOf('bar', '#FFFFFF')));
    expect(strokeOf(container, 'path', LIGHT)).toEqual([DARK]);
  });

  it('leaves a chart without a known background as it was', () => {
    const { container } = render(buildChartElement(recharts, chartOf('pie', null)));
    expect(strokeOf(container, 'path', LIGHT)).not.toContain(DARK);
  });
});
