import { createShape } from '../utils/shapes';

import { type InfografikItem, type Placed } from './composeTypes';
import { SHAREPIC_ICON_FILLED, SHAREPIC_ICON_IDS } from './sharepicIcons';
import { GAP } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';
import { balancedWrap, largestSizeWordsFit } from './textFit';

/**
 * The smallest quantity's side, as a share of the largest one's. Area-true
 * below this the object turns into a speck nobody recognises (4 kg against
 * 85 kg); the figure under it still says the truth.
 */
const MENGEN_MIN_SIDE = 0.32;
/** Air between two figures side by side, so "3,1 Mio. t 1,3 Mio. t" never reads as one. */
const CAPTION_GUTTER = 48;
/** Gap between two pictogram units, as a share of a unit; how strongly the outlines of the units not counted show. */
const ANTEIL_GAP = 0.18;
const ANTEIL_REST_OPACITY = 0.8;
/** Air between two quantity illustrations, and the largest one's side at scale 1. */
const MENGEN_ART_GAP = 32;
const MENGEN_MAX_ART = 440;

export function layoutInfografik(
  ctx: SlideCtx,
  item: InfografikItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const {
    measure,
    theme,
    isAt,
    options,
    out,
    column,
    badgeColors,
    addShape,
    addIcon,
    rect,
    text,
    lineCount,
  } = ctx;
  const { scale, paraCap } = pass;
  const placed: Placed[] = [];
  // Each point: its painted illustration (an icon on a circle when none
  // was painted), a bold title and a short text — in a grid, as steps
  // in order, or standing on a ground line, sized by their value.
  const body = theme.fonts.body;
  // Gotham Book has no bold cut: AT titles take the display face.
  const titleFamily = isAt ? theme.fonts.headline : body;
  const titleStyle = isAt ? 'normal' : 'bold';
  const punkte = item.punkte;
  const s = Math.min(scale, 1.2);
  const art = (
    artId: string,
    punkt: (typeof punkte)[number],
    x: number,
    y: number,
    size: number
  ) => {
    if (punkt.bild) {
      out.userImageInstances.push({
        id: artId,
        src: options.photoSrc(punkt.bild),
        fileName: punkt.titel,
        x,
        y,
        width: size,
        height: size,
        rotation: 0,
        scale: 1,
        opacity: 1,
      });
      out.layerOrder.push(artId);
      return;
    }
    const d = size * 0.78;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const disc = createShape('circle', cx, cy, badgeColors.fill, badgeColors.fill);
    addShape(Object.assign(disc, { id: `${artId}-badge`, width: d, height: d }));
    addIcon(`${artId}-icon`, SHAREPIC_ICON_IDS[punkt.icon], cx, cy, d * 0.55, badgeColors.ink);
  };
  const titleFit = (width: number, wanted: number) =>
    largestSizeWordsFit(
      punkte.map((p) => p.titel),
      Math.min(wanted, paraCap),
      width,
      0,
      (w, size) => measure(w, size, titleFamily, titleStyle)
    );
  const titleHeight = (titel: string, width: number, size: number) =>
    lineCount(titel, width, size, titleFamily, titleStyle) * size * 1.15;
  /**
   * Title and text of one point, `width` wide; returns the height. A
   * `titleH` taller than its own title keeps texts in one row level.
   */
  const caption = (
    pid: string,
    punkt: (typeof punkte)[number],
    width: number,
    titleSize: number,
    textSize: number,
    place: { x: number; y: number; align: 'left' | 'center' } | null,
    titleH = titleHeight(punkt.titel, width, titleSize)
  ): number => {
    const textGap = Math.round(textSize * 0.35);
    const textH = punkt.text
      ? textGap + lineCount(punkt.text, width, textSize, body, 'normal') * textSize * 1.3
      : 0;
    if (place) {
      text(`${pid}-titel`, punkt.titel, place.y, titleSize, titleFamily, {
        x: place.x,
        width,
        align: place.align,
        fontStyle: titleStyle,
        lineHeight: 1.15,
      });
      if (punkt.text) {
        // As narrow as keeps its line count, so no word hangs alone
        // ("… mittlerem / Einkommen").
        const lines = balancedWrap(punkt.text, width, (l) => measure(l, textSize, body, 'normal'));
        const textWidth = Math.min(
          width,
          Math.ceil(Math.max(...lines.map((l) => measure(l, textSize, body, 'normal')))) + 2
        );
        text(`${pid}-text`, punkt.text, place.y + titleH + textGap, textSize, body, {
          x: place.align === 'center' ? place.x + (width - textWidth) / 2 : place.x,
          width: textWidth,
          align: place.align,
          lineHeight: 1.3,
        });
      }
    }
    return titleH + textH;
  };

  if (item.form === 'raster') {
    const n = punkte.length;
    const cols = n === 4 ? 2 : Math.min(n, 3);
    const colGap = 32;
    const cw = (column.width - colGap * (cols - 1)) / cols;
    const artSize = Math.round(Math.min(cw * 0.86, 300 * scale));
    const titleSize = titleFit(cw, Math.round(44 * s));
    const textSize = Math.max(22, Math.round(titleSize * 0.66));
    const artGap = Math.round(titleSize * 0.4);
    const rowsN = Math.ceil(n / cols);
    const rowTitleH = Array.from({ length: rowsN }, (_, r) =>
      Math.max(
        ...punkte.slice(r * cols, r * cols + cols).map((p) => titleHeight(p.titel, cw, titleSize))
      )
    );
    const cellH = punkte.map(
      (p, k) =>
        artSize +
        artGap +
        caption('', p, cw, titleSize, textSize, null, rowTitleH[Math.floor(k / cols)])
    );
    const rowH = Array.from({ length: rowsN }, (_, r) =>
      Math.max(...cellH.slice(r * cols, r * cols + cols))
    );
    const rowGap = Math.round(40 * s);
    placed.push({
      height: rowH.reduce((a, b) => a + b, 0) + rowGap * (rowsN - 1),
      after: GAP,
      place: (y) => {
        let rowTop = y;
        rowH.forEach((h, r) => {
          const inRow = punkte.slice(r * cols, r * cols + cols);
          // A short last row sits centred under the full ones.
          const offset = ((cols - inRow.length) * (cw + colGap)) / 2;
          inRow.forEach((punkt, c) => {
            const pid = `${id}-${r * cols + c}`;
            const cellX = column.x + offset + c * (cw + colGap);
            art(`${pid}-bild`, punkt, cellX + (cw - artSize) / 2, rowTop, artSize);
            caption(
              pid,
              punkt,
              cw,
              titleSize,
              textSize,
              { x: cellX, y: rowTop + artSize + artGap, align: 'center' },
              rowTitleH[r]
            );
          });
          rowTop += h + rowGap;
        });
      },
    });
    return placed;
  }

  if (item.form === 'ablauf') {
    // Steps top to bottom: a numbered circle on a line, the
    // illustration, then title and text.
    const badge = Math.round(60 * s);
    const artSize = Math.round(Math.min(column.width * 0.3, 240 * scale));
    const textX = column.x + badge + 24 + artSize + 28;
    const textW = column.x + column.width - textX;
    const titleSize = titleFit(textW, Math.round(40 * s));
    const textSize = Math.max(22, Math.round(titleSize * 0.7));
    const rowH = punkte.map((p) =>
      Math.max(artSize, caption('', p, textW, titleSize, textSize, null))
    );
    const rowGap = Math.round(28 * s);
    placed.push({
      height: rowH.reduce((a, b) => a + b, 0) + rowGap * (rowH.length - 1),
      after: GAP,
      place: (y) => {
        const centres: number[] = [];
        let rowTop = y;
        punkte.forEach((punkt, k) => {
          const pid = `${id}-${k}`;
          const h = rowH[k]!;
          const cy = rowTop + h / 2;
          centres.push(cy);
          art(`${pid}-bild`, punkt, column.x + badge + 24, rowTop + (h - artSize) / 2, artSize);
          const capH = caption(pid, punkt, textW, titleSize, textSize, null);
          caption(pid, punkt, textW, titleSize, textSize, {
            x: textX,
            y: rowTop + (h - capH) / 2,
            align: 'left',
          });
          rowTop += h + rowGap;
        });
        // The line first, so the circles sit on top of it.
        const line = rect(
          `${id}-linie`,
          column.x + badge / 2 - 3,
          centres[0]!,
          6,
          centres[centres.length - 1]! - centres[0]!,
          badgeColors.fill
        );
        addShape(line);
        centres.forEach((cy, k) => {
          const pid = `${id}-${k}`;
          const disc = createShape(
            'circle',
            column.x + badge / 2,
            cy,
            badgeColors.fill,
            badgeColors.fill
          );
          addShape(Object.assign(disc, { id: `${pid}-nummer-kreis`, width: badge, height: badge }));
          const size = Math.round(badge * 0.55);
          text(`${pid}-nummer`, String(k + 1), cy - size * 0.6, size, titleFamily, {
            x: column.x,
            width: badge,
            align: 'center',
            fontStyle: titleStyle,
            fill: badgeColors.ink,
            lineHeight: 1.2,
          });
        });
      },
    });
    return placed;
  }

  if (item.form === 'zahl') {
    // One figure, huge, under the thing it counts: the illustration
    // above, the figure as large as the width allows, one line below.
    const punkt = punkte[0]!;
    const artSize = Math.round(Math.min(column.width * 0.46, 400 * scale));
    const titleSize = Math.floor(
      Math.min(
        Math.round(240 * s),
        (column.width * 100) / measure(punkt.titel, 100, titleFamily, titleStyle)
      )
    );
    const textSize = Math.max(26, Math.round(titleSize * 0.3));
    const artGap = Math.round(titleSize * 0.2);
    const capH = caption('', punkt, column.width, titleSize, textSize, null);
    placed.push({
      height: artSize + artGap + capH,
      after: GAP,
      place: (y) => {
        art(`${id}-0-bild`, punkt, column.x + (column.width - artSize) / 2, y, artSize);
        caption(`${id}-0`, punkt, column.width, titleSize, textSize, {
          x: column.x,
          y: y + artSize + artGap,
          align: 'center',
        });
      },
    });
    return placed;
  }

  if (item.form === 'anteil') {
    // Shares as pictogram rows: `wert` of `von` units in the accent, the
    // rest as outlines — "9 von 10" is counted, not estimated. 100 is a 10 × 10
    // grid. The figure is the message, so it may outgrow the paragraphs.
    const titleSize = Math.floor(
      Math.min(
        Math.round(140 * s),
        ...punkte.map((p) => (column.width * 100) / measure(p.titel, 100, titleFamily, titleStyle))
      )
    );
    const textSize = Math.max(24, Math.round(titleSize * 0.36));
    const blocks = punkte.map((p) => {
      const von = p.von ?? 10;
      // Up to five in a row; six to ten in two rows, read in fives.
      const perRow = von === 100 ? 10 : von <= 5 ? von : Math.ceil(von / 2);
      const rows = Math.ceil(von / perRow);
      // A hundred units sit closer, or the grid shrinks to specks.
      const gap = von === 100 ? ANTEIL_GAP / 2 : ANTEIL_GAP;
      const byWidth = column.width / (perRow + (perRow - 1) * gap);
      const unit = Math.round(Math.min(byWidth, (von === 100 ? 90 : 150) * scale));
      return {
        von,
        perRow,
        unit,
        gap,
        capH: caption('', p, column.width, titleSize, textSize, null),
        gridH: rows * unit + (rows - 1) * unit * gap,
      };
    });
    const inner = Math.round(titleSize * 0.4);
    const blockGap = Math.round(56 * s);
    placed.push({
      height:
        blocks.reduce((sum, b) => sum + b.capH + inner + b.gridH, 0) +
        blockGap * (blocks.length - 1),
      after: GAP,
      place: (y) => {
        let top = y;
        punkte.forEach((punkt, k) => {
          const b = blocks[k]!;
          const pid = `${id}-${k}`;
          caption(pid, punkt, column.width, titleSize, textSize, {
            x: column.x,
            y: top,
            align: 'center',
          });
          top += b.capH + inner;
          const step = b.unit * (1 + b.gap);
          const rowW = b.perRow * b.unit + (b.perRow - 1) * b.unit * b.gap;
          const left = column.x + (column.width - rowW) / 2;
          // Counted units solid; the rest of the whole as outlines at full ink,
          // so the whole stays visible (a faint solid reads as missing).
          const solid = SHAREPIC_ICON_FILLED[punkt.icon];
          const outline = SHAREPIC_ICON_IDS[punkt.icon];
          for (let u = 0; u < b.von; u++) {
            const counted = u < (punkt.wert ?? 0);
            addIcon(
              `${pid}-einheit-${u}`,
              counted ? (solid ?? outline) : outline,
              left + (u % b.perRow) * step + b.unit / 2,
              top + Math.floor(u / b.perRow) * step + b.unit / 2,
              b.unit,
              badgeColors.fill,
              counted ? 1 : solid ? ANTEIL_REST_OPACITY : ANTEIL_REST_OPACITY / 2
            );
          }
          top += b.gridH + blockGap;
        });
      },
    });
    return placed;
  }

  // mengen: the illustration's area follows the value, so its side
  // follows the square root — a doubled value looks doubled.
  const top = Math.max(...punkte.map((p) => p.wert ?? 0)) || 1;
  const rel = punkte.map((p) => Math.max(MENGEN_MIN_SIDE, Math.sqrt((p.wert ?? 0) / top)));
  // The figures are the point: large, as on the posters, and never
  // broken between number and unit.
  const evenCol = column.width / punkte.length;
  const titleSize = Math.floor(
    Math.min(
      Math.round(80 * s),
      paraCap,
      ...punkte.map(
        (p) => ((evenCol - CAPTION_GUTTER) * 100) / measure(p.titel, 100, titleFamily, titleStyle)
      )
    )
  );
  const textSize = Math.max(24, Math.round(titleSize * 0.42));
  const capW = punkte.map(
    (p) =>
      Math.max(
        measure(p.titel, titleSize, titleFamily, titleStyle),
        p.text ? measure(p.text, textSize, body, 'normal') : 0
      ) + CAPTION_GUTTER
  );
  // Columns as wide as their figure or their caption needs: a small
  // value leaves its room to the large one, which may then outgrow an
  // even third.
  const colsFor = (art: number) => rel.map((r, k) => Math.max(r * art + MENGEN_ART_GAP, capW[k]!));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let maxArt = Math.round(Math.min(MENGEN_MAX_ART * scale, column.width));
  while (maxArt > 80 && sum(colsFor(maxArt)) > column.width) maxArt -= 4;
  const slack = (column.width - sum(colsFor(maxArt))) / punkte.length;
  const cols = colsFor(maxArt).map((w) => w + Math.max(0, slack));
  const sizes = rel.map((r) => Math.round(maxArt * r));
  const ground = 8;
  const below = Math.round(titleSize * 0.4);
  const capH = Math.max(
    ...punkte.map((p, k) => caption('', p, cols[k]! - CAPTION_GUTTER, titleSize, textSize, null))
  );
  placed.push({
    height: maxArt + ground + below + capH,
    after: GAP,
    place: (y) => {
      const baseline = y + maxArt;
      addShape(rect(`${id}-boden`, column.x, baseline, column.width, ground, badgeColors.fill));
      let cellX = column.x;
      punkte.forEach((punkt, k) => {
        const pid = `${id}-${k}`;
        const cw = cols[k]!;
        const size = sizes[k]!;
        art(`${pid}-bild`, punkt, cellX + (cw - size) / 2, baseline - size, size);
        caption(pid, punkt, cw - CAPTION_GUTTER, titleSize, textSize, {
          x: cellX + CAPTION_GUTTER / 2,
          y: baseline + ground + below,
          align: 'center',
        });
        cellX += cw;
      });
    },
  });
  return placed;
}
