import { stripMarks } from '@ggraphic/editor/composer/marks';
import { largestSizeWordsFit } from '@ggraphic/editor/composer/textFit';
import { accentLines, type SharepicItem } from '@gruenerator/contracts';

import { type BrandTheme } from '../brand/theme';

import { AT_EMPHASIS_STYLE, type MeasureText } from './chromeParts';
import { type HeadlineItem } from './composeTypes';
import { COVER_SHARE, HEADLINE_FILL } from './sharepicLayoutConstants';

/** Headline size: fills its column, shrinks only when the block would not fit. */
export function headlineFit({
  measure,
  emphasis,
  theme,
  columnWidth,
  canvasHeight,
}: {
  measure: MeasureText;
  /** Accent runs set in the quote-emphasis face (`ComposerBrand.accent.emphasis`). */
  emphasis: boolean;
  theme: BrandTheme;
  /** The headline's column width, frozen before the body column narrows. */
  columnWidth: number;
  canvasHeight: number;
}) {
  const headFamily = theme.fonts.headline;
  /** Width of a headline line at 100 px; AT accent lines in Vollkorn Black Italic at 0.95. */
  const lineWidth100 = (line: string, accented: boolean) =>
    emphasis && accented
      ? measure(stripMarks(line), 95, theme.fonts.quoteEmphasis, AT_EMPHASIS_STYLE)
      : measure(stripMarks(line), 100, headFamily, 'normal');
  const coverSize = (h: HeadlineItem, cap: number) => {
    const accented = accentLines(h.akzent);
    const widest = Math.max(...h.lines.map((l, i) => lineWidth100(l, accented.includes(i))));
    return Math.min(cap, (columnWidth * HEADLINE_FILL * 100) / widest);
  };
  /** Splits a line at the word gap that balances its halves, never inside a mark. */
  const splitLine = (line: string, accented: boolean): [string, string] | null => {
    const words = line.split(' ');
    let best: [string, string] | null = null;
    let bestWidth = Number.POSITIVE_INFINITY;
    for (let k = 1; k < words.length; k++) {
      const left = words.slice(0, k).join(' ');
      const right = words.slice(k).join(' ');
      const open = (mark: RegExp) => (left.match(mark)?.length ?? 0) % 2 === 1;
      if (open(/==/g) || open(/\+\+/g) || open(/[\u2061\u2062]/g) || open(/[\u2063\u2064]/g))
        continue;
      const width = Math.max(lineWidth100(left, accented), lineWidth100(right, accented));
      if (width < bestWidth) {
        bestWidth = width;
        best = [left, right];
      }
    }
    return best;
  };
  /**
   * A headline alone on a colour is the cover: the posts set it huge, a few
   * words per line, and it fills the upper ~60 % of the slide. Long lines are
   * split at their most balanced word gap while that makes the type larger.
   */
  const growCover = (h: HeadlineItem, cap: number): HeadlineItem => {
    let best = h;
    let size = coverSize(h, cap);
    for (let round = 0; round < 4; round++) {
      const accented = accentLines(best.akzent);
      const widest = best.lines
        .map((line, i) => ({ i, w: lineWidth100(line, accented.includes(i)) }))
        .sort((a, b) => b.w - a.w)[0];
      const halves = widest ? splitLine(best.lines[widest.i]!, accented.includes(widest.i)) : null;
      if (!widest || !halves) break;
      const lines = [
        ...best.lines.slice(0, widest.i),
        ...halves,
        ...best.lines.slice(widest.i + 1),
      ];
      const akzent = accented.flatMap((a) =>
        a < widest.i ? [a] : a === widest.i ? [a, a + 1] : [a + 1]
      );
      const next: HeadlineItem = { ...best, lines, ...(akzent.length ? { akzent } : {}) };
      const nextSize = coverSize(next, cap);
      if (nextSize < size * 1.08 || lines.length * nextSize * 0.96 > canvasHeight * COVER_SHARE)
        break;
      best = next;
      size = nextSize;
    }
    return best;
  };
  /** AT accent lines are Vollkorn Black Italic at 0.95 — wider than the headline face. */
  /** AT `==word==` runs inside a line are drawn in the serif, at the line's size. */
  const headRunWidth = (line: string, size: number, weight: 'normal' | 'bold') =>
    line
      .split(/(==[^=]+==)/)
      .reduce(
        (w, part) =>
          w +
          (emphasis && part.startsWith('==')
            ? measure(stripMarks(part), size, theme.fonts.quoteEmphasis, AT_EMPHASIS_STYLE)
            : measure(stripMarks(part), size, headFamily, weight)),
        0
      );
  /** The headline's size at `headScale`, once the slide's headline (after `growCover`) is known. */
  const headlineSizer = ({
    headItem,
    headAccented,
    headMax,
    boxed,
  }: {
    headItem: SharepicItem | null;
    headAccented: number[];
    headMax: number;
    boxed: boolean;
  }) => {
    const headLineWidth = (line: string, i: number, size: number) =>
      emphasis && headAccented.includes(i)
        ? measure(stripMarks(line), size * 0.95, theme.fonts.quoteEmphasis, AT_EMPHASIS_STYLE)
        : headRunWidth(line, size, 'normal');
    return (headScale: number): number | null => {
      if (headItem?.type !== 'headline' || boxed) return null;
      const widest = Math.max(...headItem.lines.map((l, i) => headLineWidth(l, i, 100)));
      const target = Math.min(headMax, (columnWidth * HEADLINE_FILL * 100) / widest);
      return largestSizeWordsFit(
        headItem.lines,
        Math.round(Math.max(48, target * headScale)),
        columnWidth,
        0,
        // A word of a multi-word accent carries only half the marks.
        (w, size) =>
          emphasis && w.includes('==')
            ? measure(
                stripMarks(w.replace(/==/g, '')),
                size,
                theme.fonts.quoteEmphasis,
                AT_EMPHASIS_STYLE
              )
            : headRunWidth(w, size, 'bold')
      );
    };
  };
  return { growCover, headlineSizer };
}
