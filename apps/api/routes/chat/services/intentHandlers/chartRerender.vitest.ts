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

const { chartDataOnTable } = await import('./pipeline.js');

const fresh = (user: string, extra: Record<string, unknown> = {}) =>
  ({ messages: [{ role: 'user', content: user }], ...extra }) as never;

describe('chartDataOnTable — only a chart without its numbers searches', () => {
  it('a bare topic has no numbers: search for them', () => {
    expect(chartDataOnTable(fresh('Windkraftausbau in Deutschland 2015-2024'))).toBe(false);
  });

  it('numbers in the order are the data', () => {
    expect(chartDataOnTable(fresh('Wahlergebnis: Grüne 18%, SPD 22%, CDU 30%'))).toBe(true);
  });

  it('an attachment or a referenced document carries the data', () => {
    expect(chartDataOnTable(fresh('Mach ein Diagramm', { attachmentContext: 'a;b\n1;2' }))).toBe(
      true
    );
    expect(chartDataOnTable(fresh('Mach ein Diagramm', { documentIds: ['d1'] }))).toBe(true);
  });

  it('"daraus" after an answer with figures charts that answer', () => {
    expect(
      chartDataOnTable(
        turn(
          '2022 wurden 2,4 GW, 2023 3,6 GW und 2024 3,3 GW zugebaut.',
          'Mach daraus ein Diagramm'
        )
      )
    ).toBe(true);
  });

  it('a redraw of the previous chart needs no search', () => {
    expect(chartDataOnTable(turn(CHART, 'Mach es als Kreisdiagramm'))).toBe(true);
  });
});
