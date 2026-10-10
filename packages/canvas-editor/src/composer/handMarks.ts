/**
 * `((Wort))` and `__Wort__` in a slide's free text → a hand-drawn circle or
 * underline shape over the composed words.
 *
 * The marks travel through the composer as invisible sentinels: the inline
 * parser would read `__` as bold, and `((` would take room in every
 * measurement. Once the text is laid out, each marked stretch gets its box from
 * the same rich-text layout the renderer runs, the shape is laid under the
 * text, and the sentinels leave the text.
 */
import {
  layoutRichTextBlock,
  replaceHandMarks,
  SHAREPIC_HAND_MARKS,
  type HandMarkKind,
  type MeasureRun,
  type SharepicSlide,
} from '@gruenerator/contracts';

import { createShape, type ShapeInstance } from '../utils/shapes';
import { runFont } from '../utils/textUtils';

import type { MeasureText } from './chromeParts';
import type { AdditionalText } from '../configs/types';

const SENTINEL: Record<HandMarkKind, [string, string]> = {
  kreis: ['\u2061', '\u2062'],
  unterstrich: ['\u2063', '\u2064'],
};
const SENTINELS = /[\u2061-\u2064]/g;
const HAS_SENTINEL = /[\u2061-\u2064]/;
const KIND_OF: Record<string, { kind: HandMarkKind; opens: boolean }> = {
  '\u2061': { kind: 'kreis', opens: true },
  '\u2062': { kind: 'kreis', opens: false },
  '\u2063': { kind: 'unterstrich', opens: true },
  '\u2064': { kind: 'unterstrich', opens: false },
};

export const stripHandSentinels = (text: string) => text.replace(SENTINELS, '');

/** The same measurement, blind to the sentinels. */
export const sentinelBlind =
  (measure: MeasureText): MeasureText =>
  (text, ...rest) =>
    measure(stripHandSentinels(text), ...rest);

const encode = (text: string) =>
  replaceHandMarks(text, (kind, inner) => `${SENTINEL[kind][0]}${inner}${SENTINEL[kind][1]}`);

/** The slide with its marks as sentinels — only in the texts the schema lets carry them. */
export function encodeHandMarks(slide: SharepicSlide): SharepicSlide {
  return {
    ...slide,
    items: slide.items.map((item) => {
      switch (item.type) {
        case 'headline':
          return { ...item, lines: item.lines.map(encode) };
        case 'absatz':
        case 'text':
        case 'zitat':
          return { ...item, text: encode(item.text) };
        default:
          return item;
      }
    }),
  };
}

interface MarkBox {
  kind: HandMarkKind;
  left: number;
  right: number;
  /** Middle of the line box — where Konva centres the glyphs. */
  middle: number;
}

/** The marked stretches of one text element, one box per line they reach. */
function markBoxes(t: AdditionalText, measure: MeasureText): MarkBox[] {
  const weight = t.fontStyle ?? 'normal';
  const measureRun: MeasureRun = (text, style) => {
    const run = runFont(t.fontFamily, weight, style, t.accent);
    return measure(stripHandSentinels(text), t.fontSize, run.fontFamily, run.fontStyle);
  };
  const lines = layoutRichTextBlock(t.text, t.width, measureRun);
  const lineHeight = t.fontSize * (t.lineHeight ?? 1.2);
  const boxes: MarkBox[] = [];
  let open: { kind: HandMarkKind; left: number } | null = null;
  lines.forEach((line, index) => {
    const last = line.runs[line.runs.length - 1];
    const lineWidth = line.indent + (last ? last.x + measureRun(last.text, last) : 0);
    const origin =
      t.x +
      (t.align === 'center'
        ? (t.width - lineWidth) / 2
        : t.align === 'right'
          ? t.width - lineWidth
          : 0) +
      line.indent;
    const middle = t.y + index * lineHeight + lineHeight / 2;
    // A stretch the wrap broke goes on from this line's start.
    if (open) open.left = origin + (line.runs[0]?.x ?? 0);
    let lineEnd = origin;
    for (const run of line.runs) {
      for (let at = 0; at <= run.text.length; at++) {
        const mark = KIND_OF[run.text[at] ?? ''];
        if (!mark) continue;
        const x = origin + run.x + measureRun(run.text.slice(0, at).trimEnd(), run);
        if (mark.opens) {
          open = { kind: mark.kind, left: origin + run.x + measureRun(run.text.slice(0, at), run) };
        } else if (open?.kind === mark.kind) {
          boxes.push({ kind: mark.kind, left: open.left, right: x, middle });
          open = null;
        }
      }
      lineEnd = origin + run.x + measureRun(run.text.trimEnd(), run);
    }
    if (open) boxes.push({ kind: open.kind, left: open.left, right: lineEnd, middle });
  });
  return boxes.filter((b) => b.right > b.left);
}

/**
 * Lays a hand circle or underline under every marked stretch of the slide's
 * texts (the first `SHAREPIC_HAND_MARKS` of them) and takes the sentinels out
 * of every text. `ink` picks the colour for a text of the given fill.
 */
export function placeHandMarks(
  slide: {
    additionalTexts: AdditionalText[];
    shapeInstances: ShapeInstance[];
    layerOrder: string[];
  },
  measure: MeasureText,
  ink: (textFill: string) => string
): void {
  let placed = 0;
  for (const t of slide.additionalTexts) {
    if (!HAS_SENTINEL.test(t.text)) continue;
    const shapes = markBoxes(t, measure).map((box, k) => {
      const fs = t.fontSize;
      const color = ink(t.fill);
      const width = box.right - box.left;
      const shape =
        box.kind === 'kreis'
          ? Object.assign(
              createShape('hand-kreis', box.left + width / 2, box.middle + fs * 0.05, color, color),
              {
                width: width + fs * 0.75,
                height: fs * 1.38,
                strokeWidth: Math.round(Math.min(8, Math.max(4, fs * 0.05))),
              }
            )
          : Object.assign(
              createShape(
                'hand-unterstrich',
                box.left + width / 2,
                box.middle + fs * 0.6,
                color,
                color
              ),
              (() => {
                const sw = Math.round(Math.min(18, Math.max(5, fs * 0.13)));
                return { width: width + fs * 0.2, height: sw * 3, strokeWidth: sw };
              })()
            );
      return { ...shape, id: `${t.id}-${box.kind}-${k}` };
    });
    t.text = stripHandSentinels(t.text);
    const room = Math.max(0, SHAREPIC_HAND_MARKS - placed);
    const kept = shapes.slice(0, room);
    placed += kept.length;
    if (!kept.length) continue;
    slide.shapeInstances.push(...kept);
    const at = slide.layerOrder.indexOf(t.id);
    slide.layerOrder.splice(at < 0 ? slide.layerOrder.length : at, 0, ...kept.map((s) => s.id));
  }
}
