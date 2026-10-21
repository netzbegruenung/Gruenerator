import { type SharepicChartKind } from '@gruenerator/contracts';

import { CHART_PALETTES, createChartInstance, type ChartType } from '../utils/chartUtils';
import { createShape } from '../utils/shapes';

import { type DiagrammItem, type Placed } from './composeTypes';
import { GAP } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';

const CHART_TYPE: Record<SharepicChartKind, ChartType> = {
  balken: 'bar',
  'balken-quer': 'bar-horizontal',
  linie: 'line',
  kreis: 'pie',
  donut: 'donut',
};
/** The chart's card. Series too light for it get an outline (`chartSeriesOutlines`). */
const CHART_CARD = '#FFFFFF';
/** The share a pie's values leave to 100 %. */
const CHART_REST = '#C8C8C7';
/**
 * The chart renders at half size and is scaled up, so its labels (13 px in
 * the editor's chart renderer) read at 26 px on the 1080 px canvas.
 */
const CHART_SCALE = 2;
const CHART_MIN_HEIGHT = 240;

export function layoutDiagramm(
  ctx: SlideCtx,
  item: DiagrammItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const { theme, locale, canvas, out, column, xAlign, darkText, cardAccent, addShape, lineCount } =
    ctx;
  const { scale, chartShrink } = pass;
  const placed: Placed[] = [];
  // Always on a white card: the chart renderer's axes and labels are
  // dark, and the DE explainer posts set their charts the same way.
  const pad = 40;
  const inner = column.width - 2 * pad;
  const titleSize = 36;
  const titleLines = item.titel
    ? lineCount(item.titel, inner, titleSize, theme.fonts.body, 'bold', cardAccent)
    : 0;
  const titleHeight = titleLines ? titleLines * titleSize * 1.2 + 16 : 0;
  const chartHeight = Math.max(
    CHART_MIN_HEIGHT,
    Math.round(inner * 0.55 * Math.min(scale, 1.2)) - chartShrink
  );
  const height = 2 * pad + titleHeight + chartHeight;
  const round = item.art === 'kreis' || item.art === 'donut';
  const sum = item.werte.reduce((total, w) => total + w.wert, 0);
  const data = item.werte.map((w) => ({ name: w.name, value: w.wert }));
  // Shares of a whole: what the values leave to 100 % is drawn too.
  const rest = round && item.einheit === '%' && sum < 99.5;
  if (rest) data.push({ name: 'Rest', value: Math.round((100 - sum) * 10) / 10 });
  const palette = CHART_PALETTES[locale];
  // A long bar or line series reads as one colour; a few parts get one each.
  const colors =
    round || data.length <= 3
      ? data.map((_, k) =>
          rest && k === data.length - 1 ? CHART_REST : palette[k % palette.length]
        )
      : [palette[0]];
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      const card = createShape(
        'rounded-rect',
        column.x + column.width / 2,
        y + height / 2,
        CHART_CARD,
        CHART_CARD
      );
      Object.assign(card, {
        id: `${id}-card`,
        width: column.width,
        height,
        cornerRadius: 32,
      });
      addShape(card);
      if (item.titel) {
        const titleId = `${id}-titel`;
        out.additionalTexts.push({
          id: titleId,
          text: item.titel,
          type: 'body',
          x: column.x + pad,
          y: y + pad,
          width: inner,
          fontSize: titleSize,
          fontFamily: theme.fonts.body,
          fontStyle: 'bold',
          fill: darkText,
          lineHeight: 1.2,
          align: xAlign,
          accent: cardAccent,
        });
        out.layerOrder.push(titleId);
      }
      const chartId = `chart-${id}`;
      out.chartInstances.push({
        ...createChartInstance(CHART_TYPE[item.art], canvas.width, canvas.height),
        id: chartId,
        x: column.x + pad,
        y: y + pad + titleHeight,
        width: inner / CHART_SCALE,
        height: chartHeight / CHART_SCALE,
        scale: CHART_SCALE,
        data,
        colors,
        ...(item.einheit ? { unit: item.einheit } : {}),
        showLegend: round,
        showGrid: false,
        showValues: true,
        background: CHART_CARD,
      });
      out.layerOrder.push(chartId);
    },
  });
  return placed;
}
