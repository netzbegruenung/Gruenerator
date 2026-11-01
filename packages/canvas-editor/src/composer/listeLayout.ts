import { type RequiredFontRole, resolveFontRole } from '@ggraphic/core';
import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { ASSET_TARGET_SIZE } from '@ggraphic/editor/utils/canvasAssets';
import { createShape } from '@ggraphic/editor/utils/shapes';

import { emojiAssetId } from '../brand/grueneAssetCatalog';

import { type IconlisteItem, type ListeItem, type Placed } from './composeTypes';
import { brandFont } from './fontRole';
import { SHAREPIC_ICON_IDS } from './sharepicIcons';
import { CARD_MARKER, GAP } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';

export function layoutListe(ctx: SlideCtx, item: ListeItem, id: string, pass: BuildPass): Placed[] {
  const {
    measure,
    theme,
    brand,
    headFamily,
    out,
    column,
    darkText,
    onLight,
    textColor,
    accent,
    accentInk,
    cardAccent,
    addShape,
    text,
    lineCount,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  if (item.stil && item.stil !== 'punkte') {
    // A marker column (numeral, arrow or tick in the accent) beside the points.
    const wanted = Math.round((item.items.length <= 3 ? 54 : 46) * Math.min(scale, 1.3));
    const onCard = brand.layout.listCard === 'always' || onLight;
    const pad = onCard ? 46 : 0;
    const inner = column.width - 2 * pad;
    // `kasten`: no marker column; the key figure opens the point in a box.
    const kasten = item.stil === 'kasten';
    // `emoji`: a Noto image per point, the first line on its middle (DdLceC3iOBb).
    const zeichen = item.stil === 'emoji' ? (item.zeichen ?? []) : null;
    const emojiSize = Math.round(wanted * 1.8);
    const markers = item.items.map((_, k) =>
      kasten || zeichen
        ? ''
        : item.stil === 'ziffern'
          ? `${k + 1}`
          : item.stil === 'pfeile'
            ? '→'
            : '✓'
    );
    const markerSize = Math.round(wanted * (item.stil === 'ziffern' ? 1.5 : 1.1));
    const markerRole: RequiredFontRole = item.stil === 'ziffern' ? 'headline' : 'body';
    const markerFamily = resolveFontRole(theme.fonts, markerRole);
    const markerWidth = kasten
      ? 0
      : zeichen
        ? emojiSize + Math.round(wanted * 1.4)
        : Math.max(...markers.map((m) => measure(m, markerSize, markerFamily, 'bold'))) +
          Math.round(wanted * 0.5);
    const textWidth = inner - markerWidth;
    const size = largestSizeWordsFit(item.items, wanted, textWidth, 0, (w, sz) =>
      measure(w, sz, theme.fonts.body, 'bold')
    );
    const ink = onCard ? darkText : textColor;
    const markerInk = onCard ? brand.cardAccent : accentInk;
    const rowAccent = onCard ? cardAccent : accent;
    const textOffset = zeichen ? Math.max(0, (emojiSize - size * 1.25) / 2) : 0;
    const rows = item.items.map((point) =>
      Math.max(
        zeichen ? emojiSize : 0,
        textOffset +
          Math.max(1, lineCount(point, textWidth, size, theme.fonts.body, 'normal', rowAccent)) *
            size *
            1.25
      )
    );
    const rowGap = Math.round(size * (kasten ? 0.7 : zeichen ? 0.9 : 0.45));
    const body = rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
    const height = body + 2 * pad;
    placed.push({
      height,
      after: GAP,
      place: (y) => {
        if (onCard) {
          const card = createShape(
            'rounded-rect',
            column.x + column.width / 2,
            y + height / 2,
            '#FFFFFF',
            '#FFFFFF'
          );
          Object.assign(card, {
            id: `${id}-card`,
            width: column.width,
            height,
            cornerRadius: 32,
          });
          addShape(card);
        }
        let rowTop = y + pad;
        item.items.forEach((point, k) => {
          const rowId = `${id}-${k}`;
          // Numerals sit on the first line's cap height, arrows and ticks on its middle.
          const lift = (markerSize - size) * (item.stil === 'ziffern' ? 0.78 : 0.5);
          const emoji = zeichen?.[k];
          if (emoji) {
            const emojiId = `${rowId}-zeichen`;
            out.assetInstances.push({
              id: emojiId,
              assetId: emojiAssetId(emoji),
              x: column.x + pad + emojiSize / 2,
              y: rowTop + emojiSize / 2,
              scale: emojiSize / ASSET_TARGET_SIZE,
              rotation: 0,
              opacity: 1,
            });
            out.layerOrder.push(emojiId);
          } else if (!kasten && !zeichen)
            text(`${rowId}-marker`, markers[k]!, rowTop - lift, markerSize, markerRole, {
              x: column.x + pad,
              width: markerWidth,
              fontStyle: 'bold',
              fill: markerInk,
              align: 'left',
              lineHeight: 1,
              ...(item.stil === 'ziffern' ? { type: 'header' as const } : {}),
            });
          text(rowId, point, rowTop + textOffset, size, 'body', {
            x: column.x + pad + markerWidth,
            width: textWidth,
            fill: ink,
            align: 'left',
            lineHeight: 1.25,
            accent: rowAccent,
            ...(onCard ? { shadowOpacity: 0 } : {}),
            // On the white card the box is grass green (Dd6hROjIMQC).
            ...(onCard && brand.layout.listCard === 'always' ? { marker: CARD_MARKER } : {}),
          });
          rowTop += rows[k]! + rowGap;
        });
      },
    });
    return placed;
  }
  // Few points carry a demands slide on their own — they grow with it.
  const wantedSize = Math.round((item.items.length <= 3 ? 54 : 46) * Math.min(scale, 1.3));
  const isPlain = brand.layout.listCard === 'light' && !onLight;
  const pad = 46;
  const listWidth = isPlain ? column.width : column.width - 2 * pad;
  const size = largestSizeWordsFit(
    item.items,
    wantedSize,
    listWidth,
    measure('• ', wantedSize, theme.fonts.body, 'normal'),
    (w, s) => measure(w, s, theme.fonts.body, 'bold')
  );
  if (isPlain) {
    // AT sets its lists straight on the green, white with the
    // keywords bold — the white card is a German pattern.
    const plainList = item.items.map((i) => `• ${i}`).join('\n');
    const lines = lineCount(plainList, column.width, size, theme.fonts.body, 'normal');
    placed.push({
      height: lines * size * 1.3,
      after: GAP,
      place: (y) => text(id, plainList, y, size, 'body', { lineHeight: 1.3, align: 'left' }),
    });
    return placed;
  }
  const inner = column.width - 2 * pad;
  const body = item.items.map((i) => `• ${i}`).join('\n');
  const lines = lineCount(body, inner, size, theme.fonts.body, 'normal', cardAccent);
  const height = lines * size * 1.3 + 2 * pad;
  placed.push({
    height,
    after: GAP,
    place: (y) => {
      const card = createShape(
        'rounded-rect',
        column.x + column.width / 2,
        y + height / 2,
        '#FFFFFF',
        '#FFFFFF'
      );
      Object.assign(card, {
        id: `${id}-card`,
        width: column.width,
        height,
        cornerRadius: 32,
      });
      addShape(card);
      out.additionalTexts.push({
        id,
        text: body,
        type: 'body',
        x: column.x + pad,
        y: y + pad,
        width: inner,
        fontSize: size,
        ...brandFont(theme.fonts, 'body'),
        fontStyle: 'normal',
        fill: darkText,
        lineHeight: 1.3,
        accent: cardAccent,
      });
      out.layerOrder.push(id);
    },
  });
  return placed;
}

export function layoutIconliste(
  ctx: SlideCtx,
  item: IconlisteItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const { measure, theme, column, badgeColors, addShape, addIcon, text, lineCount } = ctx;
  const { scale, paraCap } = pass;
  const placed: Placed[] = [];
  // A topic icon in a circle before each point.
  const texts = item.zeilen.map((z) => z.text);
  const wantedSize = Math.min(
    Math.round((texts.length <= 3 ? 54 : 46) * Math.min(scale, 1.3)),
    paraCap
  );
  const badgeAt = (s: number) => Math.round(s * 1.4);
  const indentAt = (s: number) => badgeAt(s) + Math.round(s * 0.5);
  const size = largestSizeWordsFit(texts, wantedSize, column.width, indentAt(wantedSize), (w, s) =>
    measure(w, s, theme.fonts.body, 'bold')
  );
  const badge = badgeAt(size);
  const indent = indentAt(size);
  const textWidth = column.width - indent;
  const lineStep = size * 1.25;
  // The first line sits on the circle's middle.
  const textOffset = (badge - lineStep) / 2;
  const rows = texts.map((t) =>
    Math.max(
      badge,
      textOffset + lineCount(t, textWidth, size, theme.fonts.body, 'normal') * lineStep
    )
  );
  const rowGap = Math.round(size * 0.5);
  placed.push({
    height: rows.reduce((sum, r) => sum + r, 0) + rowGap * (rows.length - 1),
    after: GAP,
    place: (y) => {
      let rowTop = y;
      item.zeilen.forEach((zeile, k) => {
        const rowId = `${id}-${k}`;
        const cx = column.x + badge / 2;
        const cy = rowTop + badge / 2;
        const circle = createShape('circle', cx, cy, badgeColors.fill, badgeColors.fill);
        addShape(Object.assign(circle, { id: `${rowId}-badge`, width: badge, height: badge }));
        addIcon(
          `${rowId}-icon`,
          SHAREPIC_ICON_IDS[zeile.icon],
          cx,
          cy,
          badge * 0.6,
          badgeColors.ink
        );
        text(rowId, zeile.text, rowTop + textOffset, size, 'body', {
          x: column.x + indent,
          width: textWidth,
          align: 'left',
          lineHeight: 1.25,
        });
        rowTop += rows[k]! + rowGap;
      });
    },
  });
  return placed;
}
