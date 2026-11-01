import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { createShape } from '@ggraphic/editor/utils/shapes';

import {
  type BingoItem,
  type Placed,
  type SchlagzeileItem,
  type TermineItem,
} from './composeTypes';
import { ETIKETT, GAP } from './sharepicLayoutConstants';
import { sharepicTheme } from './sharepicThemes';
import { type BuildPass, type SlideCtx } from './slideContext';

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or `dark`, whichever reads better on `fill`. */
function inkFor(fill: string, dark: string): string {
  const l = luminance(fill);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance(dark) + 0.05) ? '#FFFFFF' : dark;
}

export function layoutTermine(
  ctx: SlideCtx,
  item: TermineItem,
  id: string,
  pass: BuildPass
): Placed[] {
  if (ctx.brand.layout.termine === 'etikett') return termineEtikett(ctx, item, id, pass);
  if (ctx.brand.layout.termine === 'kachel') return termineKachel(ctx, item, id, pass);
  const { measure, theme, headFamily, column, accentInk, text, lineCount, thema, addShape } = ctx;
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
  // A theme with pill colours (Pride: the flag's) sets every row on a pill
  // in the next colour, its ink chosen for it.
  const pillRows = sharepicTheme(thema)?.terminePills ?? null;
  const pills = pillRows !== null;
  const padX = pills ? Math.round(dateSize * 0.4) : 0;
  const padY = pills ? Math.round(dateSize * 0.24) : 0;
  const restWidth = column.width - dateWidth - 2 * padX;
  const rows = item.eintraege.map((e) => {
    const t = lineCount(e.titel, restWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
    const o = e.ort
      ? lineCount(e.ort, restWidth, ortSize, theme.fonts.body, 'normal') * ortSize * 1.2
      : 0;
    return Math.max(dateSize, t + (o ? Math.round(ortSize * 0.2) + o : 0)) + 2 * padY;
  });
  const rowGap = Math.round(dateSize * (pills ? 0.16 : 0.55));
  const height = rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      let top = y;
      item.eintraege.forEach((e, k) => {
        const rowId = `${id}-${k}`;
        const rowFill = pillRows ? pillRows.colors[k % pillRows.colors.length]! : null;
        const rowInk = rowFill && pillRows ? inkFor(rowFill, pillRows.darkInk) : null;
        if (rowFill) {
          const pill = createShape(
            'rounded-rect',
            column.x + column.width / 2,
            top + rows[k]! / 2,
            rowFill,
            rowFill
          );
          Object.assign(pill, {
            id: `${rowId}-pill`,
            width: column.width,
            height: rows[k]!,
            cornerRadius: Math.round(rows[k]! / 2),
          });
          addShape(pill);
        }
        const rowTop = top + padY;
        const inkOverride = rowInk ? { fill: rowInk, shadowOpacity: 0 } : {};
        text(`${rowId}-datum`, e.datum, rowTop, dateSize, 'headline', {
          x: column.x + padX,
          width: dateWidth,
          align: 'left',
          fill: rowInk ?? accentInk,
          lineHeight: 1,
          type: 'header',
          ...inkOverride,
        });
        text(`${rowId}-titel`, e.titel, rowTop + (dateSize - titleSize) * 0.4, titleSize, 'body', {
          x: column.x + padX + dateWidth,
          width: restWidth,
          align: 'left',
          fontStyle: 'bold',
          lineHeight: 1.15,
          ...inkOverride,
        });
        if (e.ort) {
          const t =
            lineCount(e.titel, restWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
          text(
            `${rowId}-ort`,
            e.ort,
            rowTop + (dateSize - titleSize) * 0.4 + t + Math.round(ortSize * 0.2),
            ortSize,
            'body',
            {
              x: column.x + padX + dateWidth,
              width: restWidth,
              align: 'left',
              opacity: 0.85,
              lineHeight: 1.2,
              ...inkOverride,
            }
          );
        }
        top += rows[k]! + rowGap;
      });
    },
  });
  return placed;
}

/**
 * GJ AT: each date on a label with a black edge, the title and its places
 * beside it (DZN0HkECuX-/02). On a dark ground every row stands on a white
 * card, the programme slide's look (DSj1z5jjK0F/02); its edge comes with
 * the brand's brutal cards.
 */
function termineEtikett(ctx: SlideCtx, item: TermineItem, id: string, pass: BuildPass): Placed[] {
  const { measure, theme, headFamily, column, text, lineCount, addShape, brand, onLight } = ctx;
  const carded = !onLight;
  const chipSize = Math.round(Math.min(34, 28 * Math.min(pass.scale, 1.25)));
  const titleSize = Math.round(chipSize * 1.55);
  const ortSize = Math.round(chipSize * 1.05);
  const padX = Math.round(chipSize * 0.55);
  const padY = Math.round(chipSize * 0.45);
  const chipHeight = chipSize + 2 * padY;
  const fills = [brand.stoerer.colors.dark.fill, theme.colors.secondary, theme.colors.primary];
  const label = (e: TermineItem['eintraege'][number]) => e.datum.toLocaleUpperCase('de-DE');
  const chipWidth =
    Math.max(...item.eintraege.map((e) => measure(label(e), chipSize, headFamily, 'normal'))) +
    2 * padX;
  const inset = carded ? Math.round(chipSize * 0.8) : 0;
  const textX = column.x + inset + chipWidth + Math.round(chipSize * 0.9);
  const textWidth = column.x + column.width - inset - textX;
  const ink = carded ? brand.darkText : null;
  const block = (e: TermineItem['eintraege'][number]) => {
    const t = lineCount(e.titel, textWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.12;
    const o = e.ort
      ? lineCount(e.ort, textWidth, ortSize, theme.fonts.body, 'normal') * ortSize * 1.2
      : 0;
    return { t, h: Math.max(chipHeight, t + (o ? Math.round(ortSize * 0.25) + o : 0)) };
  };
  const rows = item.eintraege.map((e) => block(e).h + 2 * inset);
  const rowGap = Math.round(chipSize * (carded ? 0.9 : 1.1));
  const height = rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  return [
    {
      height,
      after: GAP,
      place: (y) => {
        let top = y;
        item.eintraege.forEach((e, k) => {
          const rowId = `${id}-${k}`;
          if (carded) {
            const card = createShape(
              'rect',
              column.x + column.width / 2,
              top + rows[k]! / 2,
              '#FFFFFF',
              '#FFFFFF'
            );
            Object.assign(card, {
              id: `${rowId}-card`,
              width: column.width,
              height: rows[k]!,
              cornerRadius: 0,
            });
            addShape(card);
          }
          const rowTop = top + inset;
          const fill = fills[k % fills.length]!;
          brutalLabel(
            ctx,
            `${rowId}-chip`,
            {
              x: column.x + inset,
              y: rowTop,
              width: chipWidth,
              height: chipHeight,
              fill,
            },
            0
          );
          text(`${rowId}-datum`, label(e), rowTop + padY, chipSize, 'headline', {
            x: column.x + inset,
            width: chipWidth,
            align: 'center',
            fill: inkFor(fill, brand.darkText),
            lineHeight: 1,
            type: 'header',
            shadowOpacity: 0,
          });
          const { t } = block(e);
          text(`${rowId}-titel`, e.titel, rowTop, titleSize, 'body', {
            x: textX,
            width: textWidth,
            align: 'left',
            fontStyle: 'bold',
            lineHeight: 1.12,
            ...(ink ? { fill: ink, shadowOpacity: 0 } : {}),
          });
          if (e.ort) {
            text(`${rowId}-ort`, e.ort, rowTop + t + Math.round(ortSize * 0.25), ortSize, 'body', {
              x: textX,
              width: textWidth,
              align: 'left',
              lineHeight: 1.2,
              ...(ink ? { fill: ink, shadowOpacity: 0 } : {}),
            });
          }
          top += rows[k]! + rowGap;
        });
      },
    },
  ];
}

/** Ring holes at the top of a calendar tile. */
const KACHEL_RINGE = 4;

/**
 * GJ DE: each date on a white wall-calendar tile (rings on top, day large,
 * month under it), title bold and place beside it (DZ0Ou7KjLyZ/02).
 */
function termineKachel(ctx: SlideCtx, item: TermineItem, id: string, pass: BuildPass): Placed[] {
  const { measure, theme, headFamily, column, text, lineCount, addShape, brand } = ctx;
  const tile = Math.round(Math.min(170, 136 * Math.min(pass.scale, 1.3)));
  const titleSize = Math.round(tile * 0.3);
  const ortSize = Math.round(tile * 0.26);
  const textX = column.x + tile + Math.round(tile * 0.28);
  const textWidth = column.x + column.width - textX;
  const split = (datum: string) => {
    const at = datum.lastIndexOf(' ');
    return at > 0
      ? { tag: datum.slice(0, at), monat: datum.slice(at + 1) }
      : { tag: datum, monat: '' };
  };
  const rows = item.eintraege.map((e) => {
    const t = lineCount(e.titel, textWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
    const o = e.ort
      ? lineCount(e.ort, textWidth, ortSize, theme.fonts.body, 'normal') * ortSize * 1.2
      : 0;
    return Math.max(tile, t + o);
  });
  const rowGap = Math.round(tile * 0.24);
  const height = rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  return [
    {
      height,
      after: GAP,
      place: (y) => {
        let top = y;
        item.eintraege.forEach((e, k) => {
          const rowId = `${id}-${k}`;
          const tileTop = top + (rows[k]! - tile) / 2;
          const face = createShape(
            'rounded-rect',
            column.x + tile / 2,
            tileTop + tile / 2,
            '#FFFFFF',
            '#FFFFFF'
          );
          Object.assign(face, {
            id: `${rowId}-kachel`,
            width: tile,
            height: tile,
            cornerRadius: Math.round(tile * 0.08),
          });
          addShape(face);
          const ring = Math.round(tile * 0.06);
          for (let r = 0; r < KACHEL_RINGE; r++) {
            const hole = createShape(
              'rounded-rect',
              column.x + (tile * (r + 1)) / (KACHEL_RINGE + 1),
              tileTop + ring,
              brand.darkText,
              brand.darkText
            );
            Object.assign(hole, {
              id: `${rowId}-ring-${r}`,
              width: ring,
              height: ring * 2.6,
              cornerRadius: ring / 2,
            });
            addShape(hole);
          }
          const { tag, monat } = split(e.datum);
          const tagSize = Math.min(
            Math.round(tile * 0.34),
            Math.floor(((tile * 0.84) / Math.max(1, measure(tag, 100, headFamily, 'bold'))) * 100)
          );
          const monatSize = Math.round(tile * 0.24);
          const inner = tagSize + (monat ? monatSize * 1.05 : 0);
          const innerTop = tileTop + tile * 0.18 + (tile * 0.82 - inner) / 2;
          text(`${rowId}-datum`, tag, innerTop, tagSize, 'headline', {
            x: column.x,
            width: tile,
            align: 'center',
            fill: brand.darkText,
            lineHeight: 1,
            type: 'header',
            shadowOpacity: 0,
          });
          if (monat) {
            text(`${rowId}-monat`, monat, innerTop + tagSize * 1.05, monatSize, 'body', {
              x: column.x,
              width: tile,
              align: 'center',
              fill: brand.darkText,
              lineHeight: 1,
              shadowOpacity: 0,
            });
          }
          const t =
            lineCount(e.titel, textWidth, titleSize, theme.fonts.body, 'bold') * titleSize * 1.15;
          const o = e.ort
            ? lineCount(e.ort, textWidth, ortSize, theme.fonts.body, 'normal') * ortSize * 1.2
            : 0;
          const textTop = top + (rows[k]! - t - o) / 2;
          text(`${rowId}-titel`, e.titel, textTop, titleSize, 'body', {
            x: textX,
            width: textWidth,
            align: 'left',
            fontStyle: 'bold',
            lineHeight: 1.15,
          });
          if (e.ort) {
            text(`${rowId}-ort`, e.ort, textTop + t, ortSize, 'body', {
              x: textX,
              width: textWidth,
              align: 'left',
              lineHeight: 1.2,
            });
          }
          top += rows[k]! + rowGap;
        });
      },
    },
  ];
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
      text(`${id}-medium`, meta, metaAt.y, metaSize, 'body', {
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
      text(`${id}-titel`, item.titel, titleAt.y, titleSize, 'body', {
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
        text(`${id}-${k}`, feld, cy + cellH / 2 - (lines * size * 1.15) / 2, size, 'body', {
          x: cx + cellPad,
          width: inner,
          align: 'center',
          fontStyle: 'bold',
          fill: cellInk,
          lineHeight: 1.15,
          shadowOpacity: 0,
        });
      });
    },
  });
  return placed;
}

/** A label rectangle on a black edge with a hard offset shadow (GJ AT, DehRgj4jAe9/01). */
export function brutalLabel(
  ctx: SlideCtx,
  id: string,
  box: { x: number; y: number; width: number; height: number; fill: string },
  shadow: number = ETIKETT.shadow
): void {
  const { x, y, width, height, fill } = box;
  const edge = createShape('rect', x + width / 2, y + height / 2, '#000000', '#000000');
  Object.assign(edge, {
    id: `${id}-rand`,
    width: width + 2 * ETIKETT.edge,
    height: height + 2 * ETIKETT.edge,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowOffsetX: shadow,
    shadowOffsetY: shadow,
    shadowOpacity: shadow > 0 ? 1 : 0,
  });
  ctx.addShape(edge);
  const face = createShape('rect', x + width / 2, y + height / 2, fill, fill);
  Object.assign(face, { id, width, height });
  ctx.addShape(face);
}
