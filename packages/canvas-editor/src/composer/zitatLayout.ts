import { stripMarks } from '@ggraphic/editor/composer/marks';
import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { createShape } from '@ggraphic/editor/utils/shapes';
import { type TextAccent } from '@ggraphic/editor/utils/textUtils';

import { SHAREPIC_COLOR_HEX } from './chromeParts';
import { type FrageItem, type Placed, type ZitatItem } from './composeTypes';
import { GAP, KLEE, QUOTE_LINE_HEIGHT } from './sharepicLayoutConstants';
import { type BuildPass, type SlideCtx } from './slideContext';

/** A quote; the other side's (`seite: "gegner"`) on the muted "theirs" panel. */
export function layoutZitat(ctx: SlideCtx, item: ZitatItem, id: string, pass: BuildPass): Placed[] {
  const { out, column, contrastPanel, addShape, addIcon } = ctx;
  const placed = zitatCard(ctx, item, id, pass);
  if (item.seite === 'gegner') {
    // The other side's words on the muted panel the comparison uses for
    // "theirs", with its ✗ — the slides after it answer.
    const entry = placed[placed.length - 1];
    if (entry) {
      const pad = 36;
      const panel = contrastPanel('theirs');
      const inner = entry.place;
      entry.height += 2 * pad;
      entry.place = (y) => {
        const card = createShape(
          'rounded-rect',
          column.x + column.width / 2,
          y + entry.height / 2,
          panel.fill,
          panel.fill
        );
        Object.assign(card, {
          id: `${id}-panel`,
          width: column.width + 2 * pad,
          height: entry.height,
          cornerRadius: 28,
          opacity: panel.fillOpacity,
        });
        card.x = column.x - pad + (column.width + 2 * pad) / 2;
        addShape(card);
        const before = out.additionalTexts.length;
        inner(y + pad);
        // The quote mark (an asset in DE, an outlined glyph in AT) gives way to the ✗.
        const mark = `${id}-mark`;
        out.assetInstances = out.assetInstances.filter((a) => a.id !== mark);
        out.additionalTexts = out.additionalTexts.filter((t) => t.id !== mark);
        out.layerOrder = out.layerOrder.filter((l) => l !== mark);
        for (const t of out.additionalTexts.slice(Math.min(before, out.additionalTexts.length))) {
          if (!t.id.startsWith(id)) continue;
          t.fill = panel.ink;
          t.opacity = panel.inkOpacity;
          t.shadowOpacity = 0;
        }
        addIcon(
          `${id}-gegner`,
          panel.marker,
          column.x + column.width - 20,
          y + pad + 20,
          56,
          panel.ink,
          0.8
        );
      };
    }
  }
  return placed;
}

function zitatCard(ctx: SlideCtx, item: ZitatItem, id: string, pass: BuildPass): Placed[] {
  const {
    measure,
    theme,
    headFamily,
    brand,
    out,
    column,
    xAlign,
    quoteAlone,
    quoteSize,
    text,
    lineCount,
  } = ctx;
  const { scale } = pass;
  const placed: Placed[] = [];
  if (brand.quoteStyle === 'poster') {
    // Poster quote (AT, Gewessler posts): white poster sans, centred, a thin
    // outlined quote mark above, the name alone below — small, plain white.
    const family = headFamily;
    const size = largestSizeWordsFit(
      [stripMarks(item.text)],
      quoteSize(60, scale, 96),
      column.width,
      0,
      (w, s) => measure(w, s, family, 'bold')
    );
    const lineHeight = 1.08;
    const quoteHeight =
      lineCount(item.text, column.width, size, family, 'normal') * size * lineHeight;
    const markSize = 220;
    // The glyph fills the top ~45 % of its em box; the rest is air.
    const markHeight = Math.round(markSize * 0.45);
    const nameSize = 30;
    placed.push({
      height: markHeight + 28 + quoteHeight + 30 + nameSize * 1.2,
      after: GAP,
      place: (y) => {
        text(`${id}-mark`, '”', y - Math.round(markSize * 0.12), markSize, 'headline', {
          fill: 'transparent',
          stroke: '#FFFFFF',
          strokeWidth: 3,
          lineHeight: 1,
          shadowOpacity: 0,
        });
        text(id, item.text, y + markHeight + 28, size, 'headline', { lineHeight });
        text(`${id}-name`, item.name, y + markHeight + 28 + quoteHeight + 30, nameSize, 'body', {
          lineHeight: 1.2,
        });
      },
    });
    return placed;
  }
  // A quote has its own cap: long ones must not explode.
  const size = largestSizeWordsFit(
    [stripMarks(item.text)],
    quoteSize(52, scale, 78),
    column.width,
    0,
    (w, s) => measure(w, s, theme.fonts.body, 'bold')
  );
  const mark = quoteAlone ? 140 : 90;
  // Counted as the renderer sets it: `**bold**` runs are wider than plain text.
  const quoteHeight =
    lineCount(item.text, column.width, size, theme.fonts.body, 'normal') * size * QUOTE_LINE_HEIGHT;
  // The posts leave about three quarters of a line before the name.
  const signatureGap = Math.round(size * 0.75);
  const nameSize = 38;
  // Name bold, the medium in regular after it; the role on its own line.
  const credit = item.quelle ? `**${item.name}** ${item.quelle}` : `**${item.name}**`;
  const signatureText = item.funktion ? `${credit}\n${item.funktion}` : credit;
  const signature =
    lineCount(signatureText, column.width, nameSize, theme.fonts.body, 'normal') * nameSize * 1.25;
  placed.push({
    height: mark + 10 + quoteHeight + signatureGap + signature,
    after: GAP,
    place: (y) => {
      const markId = `${id}-mark`;
      out.assetInstances.push({
        id: markId,
        assetId: 'quote-mark-weiss',
        x: xAlign === 'center' ? column.x + column.width / 2 : column.x + mark / 2,
        y: y + mark / 2,
        scale: mark / 150,
        rotation: 0,
        opacity: 1,
      });
      out.layerOrder.push(markId);
      text(id, item.text, y + mark + 10, size, 'body', {
        lineHeight: QUOTE_LINE_HEIGHT,
      });
      text(
        `${id}-name`,
        signatureText,
        y + mark + 10 + quoteHeight + signatureGap,
        nameSize,
        'body',
        {
          lineHeight: 1.25,
        }
      );
    },
  });
  return placed;
}

export function layoutFrage(ctx: SlideCtx, item: FrageItem, id: string, pass: BuildPass): Placed[] {
  const { measure, theme, brand, column, darkInk, accent, paraBase, text, lineCount } = ctx;
  const { scale, paraCap } = pass;
  const placed: Placed[] = [];
  // The interview question: bold, clearly smaller than the answer
  // paragraph under it; the medium's prefix in its own colour (DE Klee
  // on light ground, grass green on dark; AT the yellow accent).
  const value = item.von ? `==${item.von}:== ${item.text}` : item.text;
  const prefixAccent: TextAccent =
    brand.layout.frageAccent === 'accent'
      ? accent
      : { fill: darkInk ? KLEE : SHAREPIC_COLOR_HEX.grasgruen };
  const size = largestSizeWordsFit(
    [value],
    Math.min(Math.round(paraBase * 0.75 * Math.min(scale, 1.4)), paraCap),
    column.width,
    0,
    (w, s) => measure(w, s, theme.fonts.body, 'bold')
  );
  const lines = lineCount(value, column.width, size, theme.fonts.body, 'bold', prefixAccent);
  placed.push({
    height: lines * size * 1.25,
    after: Math.round(size * 0.5),
    place: (y) =>
      text(id, value, y, size, 'body', {
        fontStyle: 'bold',
        lineHeight: 1.25,
        accent: prefixAccent,
      }),
  });
  return placed;
}
