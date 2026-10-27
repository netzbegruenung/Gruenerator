import { onGround } from '@ggraphic/editor/brand/composerBrand';
import { createShape } from '@ggraphic/editor/utils/shapes';

import { type Placed, type RechnungItem, type ZahlItem } from './composeTypes';
import { evenStops } from './sharepicGround';
import { GAP } from './sharepicLayoutConstants';
import { sharepicTheme } from './sharepicThemes';
import { type BuildPass, type SlideCtx } from './slideContext';

export function layoutZahl(ctx: SlideCtx, item: ZahlItem, id: string, pass: BuildPass): Placed[] {
  const {
    theme,
    brand,
    headFamily,
    canvas,
    column,
    xAlign,
    onLight,
    onGrass,
    accentInk,
    thema,
    addShape,
    text,
    lineCount,
    fitLine,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  const family = headFamily;
  const cap = Math.round(
    item.stil === 'riesenwort' ? 520 : Math.min(420, canvas.height * 0.32 * Math.min(scale, 1.2))
  );
  const labelSize = (wertSize: number) =>
    Math.max(36, Math.min(64, Math.round(wertSize * (item.stil === 'riesenwort' ? 0.16 : 0.2))));
  const labelHeight = (sz: number) =>
    item.label ? lineCount(item.label, column.width, sz, theme.fonts.body, 'bold') * sz * 1.2 : 0;
  if (item.stil === 'countdown') {
    // The figure in a disc, the label under it.
    const d = Math.round(Math.min(column.width * 0.62, 560 * Math.min(scale, 1.1)));
    const inner = fitLine(item.wert, Math.round(d * 0.6), d * 0.72, family);
    const ls = labelSize(d * 0.6);
    const lh = labelHeight(ls);
    placed.push({
      height: d + (lh ? Math.round(ls * 0.6) + lh : 0),
      after: GAP,
      place: (y) => {
        const cx = xAlign === 'center' ? column.x + column.width / 2 : column.x + d / 2;
        const disc = createShape('circle', cx, y + d / 2, accentInk, accentInk);
        addShape(Object.assign(disc, { id: `${id}-disc`, width: d, height: d }));
        text(`${id}-wert`, item.wert, y + d / 2 - inner * 0.52, inner, family, {
          x: cx - d / 2,
          width: d,
          align: 'center',
          fill: onGround(brand.countdownInk, { onLight, onGrass }),
          lineHeight: 1,
          type: 'header',
          shadowOpacity: 0,
        });
        if (item.label) {
          text(`${id}-label`, item.label, y + d + Math.round(ls * 0.6), ls, theme.fonts.body, {
            fontStyle: 'bold',
            lineHeight: 1.2,
          });
        }
      },
    });
    return placed;
  }
  const gradient = sharepicTheme(thema)?.kennzahlGradient ?? null;
  const size = fitLine(
    item.wert,
    cap,
    column.width * (item.stil === 'riesenwort' ? 0.98 : 0.9),
    family
  );
  const ls = labelSize(size);
  const lh = labelHeight(ls);
  placed.push({
    height: size * 0.92 + (lh ? Math.round(ls * 0.5) + lh : 0),
    after: GAP,
    place: (y) => {
      text(`${id}-wert`, item.wert, y - size * 0.06, size, family, {
        fill: accentInk,
        lineHeight: 1,
        type: 'header',
        // A theme with a gradient (Pride: the flag) runs the figure through it.
        ...(gradient
          ? {
              fillGradient: {
                type: 'linear' as const,
                angle: 0,
                stops: evenStops(onLight ? gradient.light : gradient.dark),
              },
            }
          : {}),
      });
      if (item.label) {
        text(
          `${id}-label`,
          item.label,
          y + size * 0.92 + Math.round(ls * 0.5),
          ls,
          theme.fonts.body,
          {
            fontStyle: 'bold',
            lineHeight: 1.2,
          }
        );
      }
    },
  });
  return placed;
}

export function layoutRechnung(
  ctx: SlideCtx,
  item: RechnungItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const {
    measure,
    theme,
    headFamily,
    column,
    textColor,
    accentInk,
    addShape,
    rect,
    text,
    lineCount,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  // A receipt: operator column, figure, its label; a rule; the result in the accent.
  const family = headFamily;
  const size = Math.round(Math.min(80, 56 * Math.min(scale, 1.4)));
  const resultSize = Math.round(size * 1.35);
  const opWidth = measure('−', size, family, 'bold') + Math.round(size * 0.35);
  const wertWidth =
    Math.max(
      ...item.glieder.map((g) => measure(g.wert, size, family, 'bold')),
      measure(item.ergebnis.wert, resultSize, family, 'bold')
    ) + Math.round(size * 0.35);
  const labelWidth = column.width - opWidth - wertWidth;
  const labelSize = Math.round(size * 0.6);
  const rowOf = (label: string | undefined) =>
    Math.max(
      size,
      label
        ? lineCount(label, labelWidth, labelSize, theme.fonts.body, 'normal') * labelSize * 1.2
        : 0
    );
  const rows = item.glieder.map((g) => rowOf(g.label));
  const rowGap = Math.round(size * 0.25);
  const ruleGap = Math.round(size * 0.35);
  const resultRow = Math.max(resultSize, rowOf(item.ergebnis.label));
  const height =
    rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1) + 2 * ruleGap + 6 + resultRow;
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      let top = y;
      const row = (
        k: string,
        op: string,
        wert: string,
        label: string | undefined,
        sz: number,
        ink: string
      ) => {
        if (op) {
          text(`${id}-${k}-op`, op, top, sz, family, {
            x: column.x,
            width: opWidth,
            align: 'left',
            fill: ink,
            lineHeight: 1,
            type: 'header',
          });
        }
        text(`${id}-${k}-wert`, wert, top, sz, family, {
          x: column.x + opWidth,
          width: wertWidth,
          align: 'left',
          fill: ink,
          lineHeight: 1,
          type: 'header',
        });
        if (label) {
          text(
            `${id}-${k}-label`,
            label,
            top + Math.max(0, (sz - labelSize) * 0.55),
            labelSize,
            theme.fonts.body,
            {
              x: column.x + opWidth + wertWidth,
              width: labelWidth,
              align: 'left',
              lineHeight: 1.2,
            }
          );
        }
      };
      item.glieder.forEach((g, k) => {
        row(`${k}`, k === 0 ? '' : (g.op ?? '+'), g.wert, g.label, size, textColor);
        top += rows[k]! + (k < rows.length - 1 ? rowGap : 0);
      });
      top += ruleGap;
      addShape(rect(`${id}-rule`, column.x, top, column.width, 6, textColor));
      top += 6 + ruleGap;
      row('ergebnis', '=', item.ergebnis.wert, item.ergebnis.label, resultSize, accentInk);
    },
  });
  return placed;
}
