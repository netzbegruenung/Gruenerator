/**
 * Ein Textfeld des Modells → `slide.addText`-Läufe und -Optionen.
 *
 * Fallen von pptxgenjs, die hier umgangen werden:
 * - Ein Lauf erbt JEDE falsy Option des Textfelds (`bold: false` wird zu
 *   `true`, wenn das Feld fett ist). Schrift, Farbe und Stil stehen deshalb
 *   nur am Lauf, nie am Feld.
 * - `\n` in einem Lauf beginnt einen neuen Absatz; ein Zeilenumbruch im
 *   Absatz (`hardBreak`) wird deshalb `softBreakBefore` am nächsten Lauf.
 * - Aufzählungszeichen gelten je Absatz und stehen am ersten Lauf.
 */

import { pptxFont } from './pptxFonts';
import {
  parseColor,
  pptxRotation,
  transparencyOf,
  type PptxUnits,
} from '@ggraphic/editor/export/pptx/pptxUnits';

import type { PptxShadow, PptxTextItem, PptxTextRun } from '@ggraphic/editor/export/pptx/types';
import type PptxGenJS from 'pptxgenjs';

/** Hängender Einzug der Aufzählung, wie `BULLET_INDENT` in `textModel.ts`. */
const BULLET_INDENT_EM = 1.2;

export function shadowProps(shadow: PptxShadow, units: PptxUnits): PptxGenJS.ShadowProps | null {
  const color = parseColor(shadow.color);
  if (!color) return null;
  const angle = (Math.atan2(shadow.offsetY, shadow.offsetX) * 180) / Math.PI;
  return {
    type: 'outer',
    color: color.hex,
    opacity: Math.max(0, Math.min(1, shadow.opacity * color.alpha)),
    blur: units.pt(shadow.blur),
    offset: units.pt(Math.hypot(shadow.offsetX, shadow.offsetY)),
    angle: Math.round((angle + 360) % 360),
  };
}

function runOptions(
  run: PptxTextRun,
  item: PptxTextItem,
  units: PptxUnits
): PptxGenJS.TextPropsOptions {
  const color = parseColor(run.color);
  const highlight = parseColor(run.highlight);
  const alpha = (color?.alpha ?? 1) * item.opacity;
  const outline = item.outline ? parseColor(item.outline.color) : null;
  return {
    ...pptxFont(run.fontFace ?? item.fontFace, run.bold, run.italic),
    ...(run.underline ? { underline: { style: 'sng' as const } } : {}),
    ...(color ? { color: color.hex } : {}),
    ...(alpha < 1 ? { transparency: transparencyOf(alpha) } : {}),
    ...(highlight ? { highlight: highlight.hex } : {}),
    ...(outline && item.outline
      ? { outline: { color: outline.hex, size: units.pt(item.outline.width) } }
      : {}),
  };
}

/** Die Läufe eines Textfelds, Absatz für Absatz. */
export function textRuns(item: PptxTextItem, units: PptxUnits): PptxGenJS.TextProps[] {
  const fontSizePt = units.pt(item.fontSize);
  const out: PptxGenJS.TextProps[] = [];
  item.paragraphs.forEach((paragraph, index) => {
    const isLast = index === item.paragraphs.length - 1;
    const runs: PptxGenJS.TextProps[] = [];
    const empty = () => ({
      text: '',
      options: { fontFace: pptxFont(item.fontFace, false, false).fontFace },
    });
    for (const run of paragraph.runs) {
      // Ein `hardBreak` (`\n`) und Umbrüche im Lauftext werden weiche Umbrüche:
      // je `\n` ein leerer Lauf mit `<a:br/>` davor, so bleiben Leerzeilen stehen.
      // pptxgenjs setzt den Umbruch nur vor einen Lauf, der nicht der erste ist.
      run.text.split('\n').forEach((line, lineIndex) => {
        if (lineIndex > 0) {
          if (runs.length === 0) runs.push(empty());
          runs.push({ ...empty(), options: { ...empty().options, softBreakBefore: true } });
        }
        if (line) runs.push({ text: line, options: runOptions(run, item, units) });
      });
    }
    // Ein leerer Absatz braucht einen Lauf, sonst verschwindet die Leerzeile.
    if (runs.length === 0) runs.push(empty());

    const first = runs[0]!;
    if (paragraph.bullet) {
      const indent = Math.round(fontSizePt * BULLET_INDENT_EM);
      first.options = {
        ...first.options,
        bullet:
          paragraph.bullet.type === 'number'
            ? { type: 'number', numberStartAt: paragraph.bullet.startAt, indent }
            : { indent },
      };
    }
    if (!isLast) {
      const last = runs[runs.length - 1]!;
      last.options = { ...last.options, breakLine: true };
    }
    out.push(...runs);
  });
  return out;
}

/** Die Feldoptionen: Lage, Größe, Absatzformat — keine Laufattribute (siehe oben). */
export function textBoxOptions(item: PptxTextItem, units: PptxUnits): PptxGenJS.TextPropsOptions {
  const fontSizePt = units.pt(item.fontSize);
  const shadow = item.shadow ? shadowProps(item.shadow, units) : null;
  return {
    x: units.inch(item.box.x),
    y: units.inch(item.box.y),
    w: units.inch(item.box.width),
    h: units.inch(item.box.height),
    ...(pptxRotation(item.rotation) ? { rotate: pptxRotation(item.rotation) } : {}),
    objectName: item.id,
    fontSize: fontSizePt,
    align: item.align,
    valign: item.valign,
    // Konva setzt Zeilen im festen Abstand `fontSize * lineHeight`; PowerPoints
    // „Mehrfach" hinge an den Metriken der Schrift.
    lineSpacing: fontSizePt * item.lineHeight,
    margin: 0,
    wrap: true,
    fit: 'none',
    isTextBox: true,
    ...(shadow ? { shadow } : {}),
  };
}
