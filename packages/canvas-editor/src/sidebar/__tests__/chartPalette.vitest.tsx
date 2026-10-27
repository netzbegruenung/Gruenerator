import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import {
  createChartInstance,
  type ChartInstance,
  type ChartType,
} from '@ggraphic/editor/utils/chartUtils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getBrandPack } from '../../brand/theme';
import { chartSettingsSectionEntry } from '../../configs/commonSections';
import { createFreeformAtFullConfig } from '../../configs/freeform_at_full.config';
import { createFreeformFullConfig, type FreeformState } from '../../configs/freeform_full.config';
import { ChartSettingsSection } from '../sections/ChartSettingsSection';

const format = getCanvasFormatOrDefault(null);
const CHART_PALETTES = {
  'de-DE': getBrandPack('de-DE').chart,
  'de-AT': getBrandPack('de-AT').chart,
};

function addChartOn(config: ReturnType<typeof createFreeformFullConfig>): ChartInstance {
  let state = { chartInstances: [] } as unknown as FreeformState;
  const setState = (u: Partial<FreeformState> | ((prev: FreeformState) => FreeformState)) => {
    state = typeof u === 'function' ? u(state) : { ...state, ...u };
  };
  const actions = config.createActions(() => state, setState, vi.fn(), vi.fn(), {});
  // Boundary cast: FreeformActions is Record<string, any>.
  (actions.addChart as (type: ChartType) => void)('bar');
  return (state.chartInstances as ChartInstance[])[0]!;
}

describe('chart palette of the page', () => {
  it('gives a new chart the country palette', () => {
    expect(addChartOn(createFreeformFullConfig(format)).colors).toEqual(CHART_PALETTES['de-DE']);
    expect(addChartOn(createFreeformAtFullConfig(format)).colors).toEqual(CHART_PALETTES['de-AT']);
  });

  it('hands the page palette to the chart settings', () => {
    const chart = createChartInstance('bar', 1080, 1350);
    const props = chartSettingsSectionEntry.propsFactory(
      { chartInstances: [chart] },
      {},
      { selectedElement: chart.id, chartColors: CHART_PALETTES['de-AT'] }
    ) as { palette?: readonly string[] };
    expect(props.palette).toEqual(CHART_PALETTES['de-AT']);
  });

  it('recolours from the palette it was given, never another one', () => {
    const palette = CHART_PALETTES['de-AT'];
    const chart = { ...createChartInstance('bar', 1080, 1350, palette), id: 'c1' };
    const onUpdateChart = vi.fn();
    render(
      <ChartSettingsSection
        selectedChart={chart}
        onUpdateChart={onUpdateChart}
        onRemoveChart={() => {}}
        palette={palette}
      />
    );
    fireEvent.click(screen.getByTitle(palette[1]!));
    expect(onUpdateChart).toHaveBeenCalledWith('c1', {
      colors: [palette[1], ...palette.filter((c) => c !== palette[1])],
    });
  });
});
