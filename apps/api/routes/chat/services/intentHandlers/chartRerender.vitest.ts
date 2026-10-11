import { describe, expect, it, vi } from 'vitest';

vi.mock('./searchBranch.js', () => ({ runSearchBranch: vi.fn() }));

const { isChartRerender } = await import('./pipeline.js');

const turn = (assistant: string, user: string) =>
  ({
    messages: [
      { role: 'user', content: 'Zeig die Sitzverteilung als Balkendiagramm' },
      { role: 'assistant', content: assistant },
      { role: 'user', content: user },
    ],
  }) as never;

const CHART = 'Hier ist das Diagramm:\n\n```chart\n{"type":"bar"}\n```';

describe('isChartRerender (#4460)', () => {
  it('a short order right after a chart answer redraws it — no search', () => {
    expect(isChartRerender(turn(CHART, 'Mach es als Kreisdiagramm'))).toBe(true);
  });

  it('a longer order may bring a new topic, so it may search', () => {
    expect(
      isChartRerender(
        turn(CHART, 'Mach ein Diagramm zur Entwicklung der Arbeitslosigkeit in Hessen seit 2015')
      )
    ).toBe(false);
  });

  it('without a chart in the answer before there is nothing to redraw', () => {
    expect(isChartRerender(turn('Die Sitzverteilung ist …', 'Mach es als Kreisdiagramm'))).toBe(
      false
    );
  });
});
