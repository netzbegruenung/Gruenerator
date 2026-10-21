import { createShape } from '../utils/shapes';

import {
  type BingoItem,
  type Placed,
  type SchlagzeileItem,
  type TermineItem,
} from './composeTypes';
import { GAP } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';
import { largestSizeWordsFit } from './textFit';

export function layoutTermine(
  ctx: SlideCtx,
  item: TermineItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const { measure, theme, headFamily, column, accentInk, text, lineCount } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  // Date column in the accent, title and place beside it.
  const family = headFamily;
  const dateSize = Math.round(Math.min(64, 46 * Math.min(scale, 1.4)));
  const titleSize = Math.round(dateSize * 0.82);
  const ortSize = Math.round(dateSize * 0.6);
  const dateWidth =
    Math.max(...item.eintraege.map((e) => measure(e.datum, dateSize, family, 'bold'))) +
    Math.round(dateSize * 0.5);
  const restWidth = column.width - dateWidth;
  const rows = item.eintraege.map((e) => {
    const t = lineCount(e.titel, restWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
    const o = e.ort
      ? lineCount(e.ort, restWidth, ortSize, theme.fonts.body, 'normal') * ortSize * 1.2
      : 0;
    return Math.max(dateSize, t + (o ? Math.round(ortSize * 0.2) + o : 0));
  });
  const rowGap = Math.round(dateSize * 0.55);
  const height = rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      let top = y;
      item.eintraege.forEach((e, k) => {
        const rowId = `${id}-${k}`;
        text(`${rowId}-datum`, e.datum, top, dateSize, family, {
          x: column.x,
          width: dateWidth,
          align: 'left',
          fill: accentInk,
          lineHeight: 1,
          type: 'header',
        });
        text(
          `${rowId}-titel`,
          e.titel,
          top + (dateSize - titleSize) * 0.4,
          titleSize,
          theme.fonts.body,
          {
            x: column.x + dateWidth,
            width: restWidth,
            align: 'left',
            fontStyle: 'bold',
            lineHeight: 1.15,
          }
        );
        if (e.ort) {
          const t =
            lineCount(e.titel, restWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
          text(
            `${rowId}-ort`,
            e.ort,
            top + (dateSize - titleSize) * 0.4 + t + Math.round(ortSize * 0.2),
            ortSize,
            theme.fonts.body,
            {
              x: column.x + dateWidth,
              width: restWidth,
              align: 'left',
              opacity: 0.85,
              lineHeight: 1.2,
            }
          );
        }
        top += rows[k]! + rowGap;
      });
    },
  });
  return placed;
}

export function layoutSchlagzeile(
  ctx: SlideCtx,
  item: SchlagzeileItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const { measure, theme, column, xAlign, addShape, text, lineCount } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  // A paper card: medium and date small, the headline as printed.
  const pad = 40;
  const cardWidth = Math.round(column.width * 0.94);
  const inner = cardWidth - 2 * pad;
  const titleSize = largestSizeWordsFit(
    [item.titel],
    Math.round(Math.min(64, 50 * Math.min(scale, 1.3))),
    inner,
    0,
    (w, sz) => measure(w, sz, theme.fonts.body, 'bold')
  );
  const metaSize = Math.round(titleSize * 0.5);
  const titleHeight =
    lineCount(item.titel, inner, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
  const height = Math.round(pad * 2 + metaSize * 1.3 + 14 + titleHeight);
  const angle = item.stil === 'ausriss' ? -3 : 0;
  const paper = item.stil === 'ausriss' ? '#F5F1E8' : '#FFFFFF';
  const ink = '#1E1E1E';
  placed.push({
    height: height + (angle ? Math.round(cardWidth * 0.06) : 0),
    after: GAP,
    place: (y) => {
      const left = xAlign === 'center' ? column.x + (column.width - cardWidth) / 2 : column.x;
      const top = y + (angle ? Math.round(cardWidth * 0.03) : 0);
      const cx = left + cardWidth / 2;
      const cy = top + height / 2;
      const card = createShape('rounded-rect', cx, cy, paper, paper);
      Object.assign(card, {
        id: `${id}-card`,
        width: cardWidth,
        height,
        cornerRadius: item.stil === 'ausriss' ? 4 : 24,
        rotation: angle,
      });
      addShape(card);
      // Konva turns a text about its top-left corner: move that corner
      // around the card's centre so text and paper turn together.
      const turn = (x: number, ty: number) => {
        const r = (angle * Math.PI) / 180;
        const dx = x - cx;
        const dy = ty - cy;
        return {
          x: cx + dx * Math.cos(r) - dy * Math.sin(r),
          y: cy + dx * Math.sin(r) + dy * Math.cos(r),
        };
      };
      const meta = item.datum ? `${item.medium} · ${item.datum}` : item.medium;
      const metaAt = turn(left + pad, top + pad);
      text(`${id}-medium`, meta, metaAt.y, metaSize, theme.fonts.body, {
        x: metaAt.x,
        width: inner,
        align: 'left',
        fontStyle: 'bold',
        fill: ink,
        opacity: 0.65,
        lineHeight: 1.3,
        rotation: angle,
        shadowOpacity: 0,
      });
      const titleAt = turn(left + pad, top + pad + metaSize * 1.3 + 14);
      text(`${id}-titel`, item.titel, titleAt.y, titleSize, theme.fonts.body, {
        x: titleAt.x,
        width: inner,
        align: 'left',
        fontStyle: 'bold',
        fill: ink,
        lineHeight: 1.15,
        rotation: angle,
        shadowOpacity: 0,
      });
    },
  });
  return placed;
}

export function layoutBingo(ctx: SlideCtx, item: BingoItem, id: string): Placed[] {
  const { measure, theme, canvas, column, darkText, darkInk, addShape, text, lineCount } = ctx;
  const placed: Placed[] = [];
  // Cells across the full column, as tall as they are wide at most:
  // a long word needs the width more than the cell needs to be square.
  const n = item.felder.length === 16 ? 4 : 3;
  const gap = 12;
  const cellW = Math.floor((column.width - gap * (n - 1)) / n);
  const cellH = Math.min(cellW, Math.floor((canvas.height * 0.5 - gap * (n - 1)) / n));
  const cellPad = Math.round(cellW * 0.07);
  const inner = cellW - 2 * cellPad;
  // 8 % air: the renderer breaks inside a word that misses by a pixel.
  // Each cell takes its own size, at most half again the smallest, so
  // a long word does not shrink every phrase.
  const fits = item.felder.map((f) =>
    Math.max(
      20,
      largestSizeWordsFit([f], Math.round(cellH * 0.24), inner * 0.92, 0, (w, sz) =>
        measure(w, sz, theme.fonts.body, 'bold')
      )
    )
  );
  const smallest = Math.min(...fits);
  const sizes = fits.map((f) => Math.min(f, Math.round(smallest * 1.5)));
  const cellFill = darkInk ? darkText : '#FFFFFF';
  const cellInk = darkInk ? '#FFFFFF' : darkText;
  const height = n * cellH + (n - 1) * gap;
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      item.felder.forEach((feld, k) => {
        const cx = column.x + (k % n) * (cellW + gap);
        const cy = y + Math.floor(k / n) * (cellH + gap);
        const box = createShape('rounded-rect', cx + cellW / 2, cy + cellH / 2, cellFill, cellFill);
        Object.assign(box, {
          id: `${id}-${k}-feld`,
          width: cellW,
          height: cellH,
          cornerRadius: 12,
        });
        addShape(box);
        const size = sizes[k]!;
        const lines = lineCount(feld, inner, size, theme.fonts.body, 'bold');
        text(
          `${id}-${k}`,
          feld,
          cy + cellH / 2 - (lines * size * 1.15) / 2,
          size,
          theme.fonts.body,
          {
            x: cx + cellPad,
            width: inner,
            align: 'center',
            fontStyle: 'bold',
            fill: cellInk,
            lineHeight: 1.15,
            shadowOpacity: 0,
          }
        );
      });
    },
  });
  return placed;
}
