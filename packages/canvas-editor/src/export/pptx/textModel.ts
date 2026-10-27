import { defaultTextMarker, markerInkOn } from '@ggraphic/editor/utils/markerColors';
import { markdownLiteToRichText, type CanvasRichTextDoc } from '@ggraphic/schema';

import type { PptxBullet, PptxParagraph, PptxTextRun } from './types';
import type { AdditionalText } from '@ggraphic/editor/configs/types';

type RichNode = NonNullable<CanvasRichTextDoc['content']>[number];

/** Breite eines Textstücks in px; im Browser die echte Messung (`defaultMeasure`). */
export type PptxMeasureText = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
) => number;

/** Ohne Messung: halbe Schriftgröße je Zeichen, wie der Rückfall in `measureTextWidthWithFont`. */
export const estimateMeasure: PptxMeasureText = (text, fontSize) => text.length * fontSize * 0.5;

function markColor(node: RichNode, type: 'accent' | 'marker'): string | null {
  const color = node.marks?.find((mark) => mark.type === type)?.attrs?.color;
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

/**
 * Ein Lauf, wie `CanvasRichText` ihn zeichnet: eine eigene Passagenfarbe färbt
 * nur, die Akzentschrift der Vorlage gilt für Akzentläufe ohne eigene Farbe;
 * im Markerkasten steht die Schrift, die zum Kasten passt.
 */
function toRun(node: RichNode, text: AdditionalText, baseBold: boolean, baseItalic: boolean) {
  const has = (type: string) => !!node.marks?.some((mark) => mark.type === type);
  const accentColor = has('accent') ? markColor(node, 'accent') : null;
  const asAccent = has('accent') && !!text.accent && !accentColor;
  const accentStyle = asAccent ? (text.accent?.fontStyle ?? null) : null;
  const bold = has('bold') || (accentStyle ? accentStyle.includes('bold') : baseBold);
  const italic = has('italic') || (accentStyle ? accentStyle.includes('italic') : baseItalic);

  let color = accentColor ?? (asAccent ? text.accent!.fill : text.fill);
  let highlight: string | null = null;
  if (has('marker')) {
    const marker = text.marker ?? defaultTextMarker();
    const markerColor = markColor(node, 'marker');
    highlight = markerColor ?? marker.fill;
    color = accentColor ?? (markerColor ? markerInkOn(markerColor) : marker.color);
  }

  const run: PptxTextRun = {
    text: node.text ?? '',
    bold,
    italic,
    underline: has('underline'),
    color,
    highlight,
    fontFace: asAccent ? (text.accent?.fontFamily ?? null) : null,
  };
  return run;
}

function paragraphOf(
  node: RichNode | null,
  bullet: PptxBullet | null,
  text: AdditionalText,
  baseBold: boolean,
  baseItalic: boolean
): PptxParagraph {
  const runs: PptxTextRun[] = [];
  for (const child of node?.content ?? []) {
    if (child.type === 'text') runs.push(toRun(child, text, baseBold, baseItalic));
    else if (child.type === 'hardBreak') runs.push({ ...emptyRun(text), text: '\n' });
  }
  return { runs, bullet };
}

function emptyRun(text: AdditionalText): PptxTextRun {
  return {
    text: '',
    bold: false,
    italic: false,
    underline: false,
    color: text.fill,
    highlight: null,
    fontFace: null,
  };
}

/** Markdown-lite des Textfelds → Absätze mit Läufen und Aufzählung. */
export function textParagraphs(text: AdditionalText): PptxParagraph[] {
  const style = text.fontStyle ?? 'normal';
  const baseBold = style.includes('bold');
  const baseItalic = style.includes('italic');
  const doc = markdownLiteToRichText(text.text);
  const paragraphs: PptxParagraph[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const start = typeof block.attrs?.start === 'number' ? block.attrs.start : 1;
      const bullet: PptxBullet =
        block.type === 'orderedList' ? { type: 'number', startAt: start } : { type: 'bullet' };
      for (const item of block.content ?? []) {
        paragraphs.push(paragraphOf(item.content?.[0] ?? null, bullet, text, baseBold, baseItalic));
      }
      continue;
    }
    paragraphs.push(paragraphOf(block, null, text, baseBold, baseItalic));
  }
  return paragraphs;
}

/** Hängender Einzug eines Listenpunkts, in Vielfachen der Schriftgröße (geschätzt). */
const BULLET_INDENT = 1.2;

/**
 * Wie viele Zeilen der Text bei `width` umbricht — für die Höhe der Box, die
 * PowerPoint als Drehmitte braucht. Wortweise, wie Konva `wrap="word"`.
 */
export function wrappedLineCount(
  paragraphs: readonly PptxParagraph[],
  width: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string,
  measure: PptxMeasureText
): number {
  let count = 0;
  for (const paragraph of paragraphs) {
    const available = width - (paragraph.bullet ? BULLET_INDENT * fontSize : 0);
    const lines = paragraph.runs
      .map((run) => run.text)
      .join('')
      .split('\n');
    for (const line of lines) {
      const words = line.split(/\s+/).filter(Boolean);
      let lineCount = 1;
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (current && measure(next, fontSize, fontFamily, fontStyle) > available) {
          lineCount += 1;
          current = word;
        } else {
          current = next;
        }
      }
      count += lineCount;
    }
  }
  return Math.max(1, count);
}
