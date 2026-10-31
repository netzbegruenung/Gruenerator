import { onGround } from '@ggraphic/editor/brand/composerBrand';
import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { createPillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';

import { AT_EMPHASIS_STYLE } from './chromeParts';
import { type AufrufItem, type Placed } from './composeTypes';
import { GAP } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';

export function layoutAufruf(
  ctx: SlideCtx,
  item: AufrufItem,
  id: string,
  pass: BuildPass
): Placed[] {
  const {
    measure,
    theme,
    brand,
    headFamily,
    out,
    column,
    xAlign,
    onLight,
    onGrass,
    accentInk,
    text,
    lineCount,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  const family = headFamily;
  const lineHeight = brand.lineHeight.aufruf;
  const size = largestSizeWordsFit(
    [item.text],
    Math.round(Math.min(item.stil === 'kernsatz' ? 120 : 104, 82 * scale)),
    column.width,
    0,
    (w, s) => measure(w, s, family, 'bold')
  );
  const lines = lineCount(item.text, column.width, size, family, 'normal');
  if (item.stil === 'ausruf') {
    // A huge "!" over the demand, in the accent — the posts' closing call.
    const bang = Math.round(Math.min(size * 3.6, 460));
    placed.push({
      height: bang * 0.82,
      after: Math.round(size * 0.2),
      place: (y) =>
        text(`${id}-ausruf`, '!', y - bang * 0.12, bang, family, {
          fill: accentInk,
          lineHeight: 1,
          type: 'header',
        }),
    });
  }
  if (item.adressat) {
    const small = Math.round(size * 0.42);
    const adressat = item.adressat;
    placed.push({
      height: lineCount(adressat, column.width, small, theme.fonts.body, 'bold') * small * 1.15,
      after: Math.round(size * 0.18),
      place: (y) =>
        text(`${id}-adressat`, adressat, y, small, theme.fonts.body, {
          fontStyle: 'bold',
          lineHeight: 1.15,
        }),
    });
  }
  placed.push({
    height: lines * size * lineHeight,
    after: Math.round(size * 0.4),
    place: (y) => text(id, item.text, y, size, family, { lineHeight, type: 'header' }),
  });
  if (item.hinweis && item.stil === 'petition' && brand.features.hinweisPill) {
    // The hint as a pill under the call — where to sign.
    const pillSize = Math.round(Math.min(46, size * 0.5));
    const hint = item.hinweis;
    const colors = onGround(brand.button, { onLight, onGrass });
    const pill = createPillBadgeInstance('slider', {
      id: `${id}-hinweis`,
      text: hint,
      fontSize: pillSize,
      fontFamily: theme.fonts.headline,
      backgroundColor: colors.fill,
      textColor: colors.ink,
      paddingX: 36,
      paddingY: 18,
      cornerRadius: 60,
    });
    const height = pillSize + 2 * pill.paddingY;
    const width = measure(hint, pillSize, theme.fonts.headline, 'normal') + 2 * pill.paddingX;
    placed.push({
      height,
      after: GAP,
      place: (y) => {
        const x = xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x;
        out.pillBadgeInstances.push({ ...pill, x, y });
        out.layerOrder.push(`${id}-hinweis`);
      },
    });
  } else if (item.hinweis) {
    // AT has no pills: the hint is a line, on a petition in the yellow serif.
    const petitionAt = !brand.features.hinweisPill && item.stil === 'petition';
    const small = Math.round(size * (petitionAt ? 0.55 : 0.4));
    const hint = item.hinweis;
    placed.push({
      height: small * 1.2,
      after: GAP,
      place: (y) =>
        petitionAt
          ? text(`${id}-hinweis`, hint, y, small, theme.fonts.quoteEmphasis, {
              fontStyle: AT_EMPHASIS_STYLE,
              fill: accentInk,
              lineHeight: 1.2,
            })
          : text(`${id}-hinweis`, hint, y, small, theme.fonts.body, {
              fontStyle: 'bold',
              lineHeight: 1.2,
            }),
    });
  }
  return placed;
}
