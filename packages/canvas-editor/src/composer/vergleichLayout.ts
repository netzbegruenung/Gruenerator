import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { createShape } from '@ggraphic/editor/utils/shapes';

import { LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { type FaktencheckItem, type Placed, type VergleichItem } from './composeTypes';
import { VERGLEICH_MARKER_IDS } from './sharepicIcons';
import { GAP, MARKER_PAD_X, TOP_PAD } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';

/** `vergleich` with `stil: "spalten"`, measured on Ddouf0QiL1w/01 at 1080 px. */
const VERGLEICH_SPALTEN = {
  titleMax: 58,
  pointMax: 36,
  vs: 150,
  /** The red of the post's ✗ circles. */
  cross: '#E3352F',
  /** Their points: grey, not muted by opacity. */
  theirsInk: '#5F6B66',
} as const;

/**
 * `vergleich` with `stil: "spalten"`: two half-slide columns, each a
 * three-line headline-face title over its points, the markers per point.
 */
function vergleichSpalten(ctx: SlideCtx, id: string, item: VergleichItem): void {
  const {
    measure,
    theme,
    brandId,
    canvas,
    headFamily,
    logoAt,
    addShape,
    addIcon,
    rect,
    text,
    lineCount,
  } = ctx;
  const half = canvas.width / 2;
  const pad = 56;
  const inner = half - 2 * pad;
  // The titles keep clear of the VS on the seam.
  const titleInner = inner - VERGLEICH_SPALTEN.vs * 0.3;
  const top = TOP_PAD[brandId] - 50;
  const cols = [
    { key: 'links' as const, side: item.links, x: 0, fill: SHAREPIC_COLOR_HEX.mint },
    { key: 'rechts' as const, side: item.rechts, x: half, fill: SHAREPIC_COLOR_HEX.grasgruen },
  ];
  for (const col of cols) {
    addShape(rect(`${id}-${col.key}-flaeche`, col.x, 0, half, canvas.height, col.fill));
  }
  // Titles fill their column in the headline face, as tall as the longer one needs.
  const titleSize = Math.min(
    VERGLEICH_SPALTEN.titleMax,
    largestSizeWordsFit(
      cols.map((c) => c.side.titel),
      VERGLEICH_SPALTEN.titleMax,
      titleInner,
      0,
      (w, sz) => measure(w, sz, headFamily, 'normal')
    )
  );
  const titleLeading = 1.0;
  const titleHeight = Math.max(
    ...cols.map(
      (c) => lineCount(c.side.titel, titleInner, titleSize, headFamily, 'normal') * titleSize
    )
  );
  const pointSize = largestSizeWordsFit(
    [...item.links.punkte, ...item.rechts.punkte],
    VERGLEICH_SPALTEN.pointMax,
    inner - VERGLEICH_SPALTEN.pointMax * 1.4,
    0,
    (w, sz) => measure(w, sz, theme.fonts.body, 'bold')
  );
  const marker = Math.round(pointSize * 1.05);
  const indent = marker + Math.round(pointSize * 0.45);
  const pointsTop = top + titleHeight + Math.round(titleSize * 0.7);
  cols.forEach((col, i) => {
    const colId = `${id}-${col.key}`;
    const theirs = i === 0;
    text(`${colId}-titel`, col.side.titel, top, titleSize, headFamily, {
      x: col.x + pad + (theirs ? 0 : inner - titleInner),
      width: titleInner,
      align: 'center',
      lineHeight: titleLeading,
      type: 'header',
      fill: SHAREPIC_COLOR_HEX.dunkeltanne,
      accent: { fill: SHAREPIC_COLOR_HEX.dunkeltanne },
      marker: {
        fill: theirs ? '#FFFFFF' : LIME,
        color: SHAREPIC_COLOR_HEX.dunkeltanne,
        padX: MARKER_PAD_X,
      },
      shadowOpacity: 0,
    });
    let rowTop = pointsTop;
    col.side.punkte.forEach((raw, k) => {
      const own = /^([✓✗])\s*/u.exec(raw);
      const kind = own ? (own[1] === '✓' ? 'haken' : 'kreuz') : theirs ? 'kreuz' : 'haken';
      const value = own ? raw.slice(own[0].length) : raw;
      const pointId = `${colId}-${k}`;
      addIcon(
        `${pointId}-marker`,
        kind === 'haken' ? VERGLEICH_MARKER_IDS.rechts : VERGLEICH_MARKER_IDS.links,
        col.x + pad + marker / 2,
        rowTop + (pointSize * 1.25) / 2,
        marker,
        kind === 'kreuz'
          ? VERGLEICH_SPALTEN.cross
          : theirs
            ? SHAREPIC_COLOR_HEX.grasgruen
            : SHAREPIC_COLOR_HEX.dunkeltanne
      );
      text(pointId, value, rowTop, pointSize, theme.fonts.body, {
        x: col.x + pad + indent,
        width: inner - indent,
        align: 'left',
        lineHeight: 1.25,
        // Theirs in grey, ours in the dark green, as the post sets them.
        fill: theirs ? VERGLEICH_SPALTEN.theirsInk : SHAREPIC_COLOR_HEX.dunkeltanne,
        accent: { fill: theirs ? VERGLEICH_SPALTEN.theirsInk : SHAREPIC_COLOR_HEX.dunkeltanne },
        shadowOpacity: 0,
      });
      rowTop +=
        lineCount(value, inner - indent, pointSize, theme.fonts.body, 'normal') * pointSize * 1.25 +
        Math.round(pointSize * 0.7);
    });
  });
  // VS across the seam at title height: white, outlined in grass green.
  const vs = VERGLEICH_SPALTEN.vs;
  text(`${id}-vs`, 'VS', top + titleHeight / 2 - vs * 0.55, vs, headFamily, {
    x: half - vs,
    width: 2 * vs,
    align: 'center',
    lineHeight: 1,
    type: 'header',
    fill: '#FFFFFF',
    stroke: SHAREPIC_COLOR_HEX.grasgruen,
    strokeWidth: 6,
    shadowOpacity: 0,
  });
  // The sender sits under our column, dark on the grass green.
  logoAt.current = { x: half + half / 2 };
}

export function layoutVergleich(
  ctx: SlideCtx,
  item: VergleichItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const {
    measure,
    theme,
    brand,
    out,
    column,
    headFamily,
    contrastPanel,
    addShape,
    addIcon,
    lineCount,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  if (item.stil === 'spalten' && brand.features.vergleichSpalten) {
    // The slide split edge to edge (Ddouf0QiL1w/01): theirs on mint,
    // ours on grass green, a VS across the seam. It takes the slide
    // alone (schema), so it draws on the canvas, not in the column.
    placed.push({ height: 0, after: 0, place: () => vergleichSpalten(ctx, id, item) });
    return placed;
  }
  // Two panels side by side: the opponent's plan left, ours right.
  const sides = [
    { key: 'links' as const, side: item.links, ...contrastPanel('theirs') },
    { key: 'rechts' as const, side: item.rechts, ...contrastPanel('ours') },
  ];
  const panelGap = 24;
  const pad = 36;
  const panelWidth = (column.width - panelGap) / 2;
  const inner = panelWidth - 2 * pad;
  const titleSize = largestSizeWordsFit(
    [item.links.titel, item.rechts.titel],
    Math.round(46 * Math.min(scale, 1.2)),
    inner,
    0,
    (w, s) => measure(w, s, headFamily, 'bold')
  );
  const titleLeading = 1.05;
  const titleHeight = Math.max(
    ...sides.map(
      (s) =>
        lineCount(s.side.titel, inner, titleSize, headFamily, 'normal', s.accent) *
        titleSize *
        titleLeading
    )
  );
  const markerAt = (s: number) => Math.round(s * 1.1);
  const indentAt = (s: number) => markerAt(s) + Math.round(s * 0.4);
  const wantedPoint = Math.round(34 * Math.min(scale, 1.2));
  const pointSize = largestSizeWordsFit(
    [...item.links.punkte, ...item.rechts.punkte],
    wantedPoint,
    inner,
    indentAt(wantedPoint),
    (w, s) => measure(w, s, theme.fonts.body, 'bold')
  );
  const marker = markerAt(pointSize);
  const indent = indentAt(pointSize);
  const lineStep = pointSize * 1.25;
  const pointGap = Math.round(pointSize * 0.6);
  const rowsOf = (s: (typeof sides)[number]) =>
    s.side.punkte.map(
      (p) =>
        lineCount(p, inner - indent, pointSize, theme.fonts.body, 'normal', s.accent) * lineStep
    );
  const pointsTop = pad + titleHeight + Math.round(titleSize * 0.5);
  const height =
    pointsTop +
    Math.max(
      ...sides.map((s) => {
        const rows = rowsOf(s);
        return rows.reduce((sum, r) => sum + r, 0) + pointGap * (rows.length - 1);
      })
    ) +
    pad;
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      sides.forEach((s, i) => {
        const sideId = `${id}-${s.key}`;
        const x = column.x + i * (panelWidth + panelGap);
        const panel = createShape(
          'rounded-rect',
          x + panelWidth / 2,
          y + height / 2,
          s.fill,
          s.fill
        );
        Object.assign(panel, {
          id: `${sideId}-card`,
          width: panelWidth,
          height,
          cornerRadius: 32,
          opacity: s.fillOpacity,
        });
        addShape(panel);
        const inPanel = {
          type: 'body' as const,
          fill: s.ink,
          opacity: s.inkOpacity,
          accent: s.accent,
        };
        out.additionalTexts.push({
          ...inPanel,
          id: `${sideId}-titel`,
          text: s.side.titel,
          x: x + pad,
          y: y + pad,
          width: inner,
          fontSize: titleSize,
          fontFamily: headFamily,
          fontStyle: 'normal',
          lineHeight: titleLeading,
          align: 'center',
        });
        out.layerOrder.push(`${sideId}-titel`);
        const rows = rowsOf(s);
        let rowTop = y + pointsTop;
        s.side.punkte.forEach((punkt, k) => {
          const pointId = `${sideId}-${k}`;
          addIcon(
            `${pointId}-marker`,
            s.marker,
            x + pad + marker / 2,
            rowTop + lineStep / 2,
            marker,
            s.ink,
            s.inkOpacity
          );
          out.additionalTexts.push({
            ...inPanel,
            id: pointId,
            text: punkt,
            x: x + pad + indent,
            y: rowTop,
            width: inner - indent,
            fontSize: pointSize,
            fontFamily: theme.fonts.body,
            fontStyle: 'normal',
            lineHeight: 1.25,
          });
          out.layerOrder.push(pointId);
          rowTop += rows[k]! + pointGap;
        });
      });
    },
  });
  return placed;
}

export function layoutFaktencheck(
  ctx: SlideCtx,
  item: FaktencheckItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const { measure, theme, out, column, contrastPanel, addShape, addIcon, lineCount } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  // Each claim above its correction, full width: the claim faint with ✗
  // under „Mythos“, the fact on the accent with ✓ under „Fakt“.
  const pad = 32;
  const inner = column.width - 2 * pad;
  const labelSize = Math.round(32 * Math.min(scale, 1.2));
  const marker = Math.round(labelSize * 1.15);
  const textSize = largestSizeWordsFit(
    item.paare.flatMap((p) => [p.mythos, p.fakt]),
    Math.round(38 * Math.min(scale, 1.2)),
    inner,
    0,
    (w, size) => measure(w, size, theme.fonts.body, 'bold')
  );
  const labelGap = Math.round(textSize * 0.45);
  const cards = item.paare.flatMap((paar, k) =>
    (['theirs', 'ours'] as const).map((side) => {
      const style = contrastPanel(side);
      const text = side === 'theirs' ? paar.mythos : paar.fakt;
      // Measured in the weight it is set in: the fact is bold.
      const weight = side === 'ours' ? 'bold' : 'normal';
      const textH =
        lineCount(text, inner, textSize, theme.fonts.body, weight, style.accent) * textSize * 1.25;
      return {
        id: `${id}-${k}-${side === 'theirs' ? 'mythos' : 'fakt'}`,
        label: side === 'theirs' ? 'Mythos' : 'Fakt',
        text,
        style,
        height: pad + marker + labelGap + textH + pad,
        pairEnd: side === 'ours',
      };
    })
  );
  const cardGap = 12;
  const pairGap = Math.round(36 * Math.min(scale, 1.2));
  const gaps = cards.slice(0, -1).map((c) => (c.pairEnd ? pairGap : cardGap));
  placed.push({
    height: cards.reduce((sum, c) => sum + c.height, 0) + gaps.reduce((a, b) => a + b, 0),
    after: GAP,
    place: (y) => {
      let top = y;
      cards.forEach((card, k) => {
        const { style } = card;
        const panel = createShape(
          'rounded-rect',
          column.x + column.width / 2,
          top + card.height / 2,
          style.fill,
          style.fill
        );
        Object.assign(panel, {
          id: `${card.id}-card`,
          width: column.width,
          height: card.height,
          cornerRadius: 28,
          opacity: style.fillOpacity,
        });
        addShape(panel);
        addIcon(
          `${card.id}-marker`,
          style.marker,
          column.x + pad + marker / 2,
          top + pad + marker / 2,
          marker,
          style.ink,
          style.inkOpacity
        );
        const inCard = {
          type: 'body' as const,
          fill: style.ink,
          opacity: style.inkOpacity,
          accent: style.accent,
          fontFamily: theme.fonts.body,
        };
        out.additionalTexts.push({
          ...inCard,
          id: `${card.id}-label`,
          text: card.label,
          x: column.x + pad + marker + 12,
          y: top + pad + (marker - labelSize * 1.2) / 2,
          width: inner - marker - 12,
          fontSize: labelSize,
          fontStyle: 'bold',
          lineHeight: 1.2,
          align: 'left',
        });
        out.layerOrder.push(`${card.id}-label`);
        out.additionalTexts.push({
          ...inCard,
          id: `${card.id}-text`,
          text: card.text,
          x: column.x + pad,
          y: top + pad + marker + labelGap,
          width: inner,
          fontSize: textSize,
          fontStyle: card.label === 'Fakt' ? 'bold' : 'normal',
          lineHeight: 1.25,
          align: 'left',
        });
        out.layerOrder.push(`${card.id}-text`);
        top += card.height + (gaps[k] ?? 0);
      });
    },
  });
  return placed;
}
