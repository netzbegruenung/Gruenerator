import { createChartInstance, type ChartInstance } from '@ggraphic/editor/utils/chartUtils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import { ChartSettingsSection } from '@ggraphic/editor/sidebar/sections/ChartSettingsSection';

function Harness({ initial }: { initial: ChartInstance }) {
  const [chart, setChart] = useState(initial);
  return (
    <>
      <ChartSettingsSection
        selectedChart={chart}
        onUpdateChart={(_, partial) => setChart((c) => ({ ...c, ...partial }))}
        onRemoveChart={() => {}}
      />
      <output data-testid="state">{JSON.stringify(chart)}</output>
    </>
  );
}

const stateOf = (): ChartInstance =>
  JSON.parse(screen.getByTestId('state').textContent!) as ChartInstance;

describe('ChartSettingsSection — series (#4870)', () => {
  it('adds a series column, edits it and turns the legend on', async () => {
    const user = userEvent.setup();
    render(<Harness initial={createChartInstance('bar', 1920, 1080)} />);
    expect(screen.queryByRole('switch', { name: 'Legende' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Gitternetz' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Datenreihe/ }));
    const cell = screen.getByRole('spinbutton', { name: 'Reihe 2: A' });
    await user.clear(cell);
    await user.type(cell, '12');
    await user.clear(screen.getByRole('textbox', { name: 'Name der Reihe 2' }));
    await user.type(screen.getByRole('textbox', { name: 'Name der Reihe 2' }), '2025');

    const chart = stateOf();
    expect(chart.series?.[1]).toEqual({ name: '2025', values: [12, 0, 0, 0] });
    expect(chart.data[0]!.value).toBe(40);
    expect(chart.showLegend).toBe(true);
    expect(screen.getByRole('switch', { name: 'Legende' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Rechts' }));
    expect(stateOf().legendPosition).toBe('right');
  });

  it('offers no series for a pie', () => {
    render(<Harness initial={createChartInstance('pie', 1920, 1080)} />);
    expect(screen.queryByRole('button', { name: /Datenreihe/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Position der Legende' })).toBeTruthy();
  });

  it('has no axe violations with several series', async () => {
    const chart = createChartInstance('bar', 1920, 1080);
    const { container } = render(
      <Harness
        initial={{
          ...chart,
          showLegend: true,
          series: [
            { name: 'A', values: chart.data.map((d) => d.value) },
            { name: 'B', values: chart.data.map(() => 1) },
          ],
        }}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
