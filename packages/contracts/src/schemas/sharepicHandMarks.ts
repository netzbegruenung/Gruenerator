import { parseHandMarks, stripHandMarks } from '../text/handMarks.js';
import { stripInlineMarks } from '../text/inlineMarks.js';

import { type SharepicItem } from './sharepicCreator.js';

/** Hand-drawn marks (`((Wort))`, `__Wort__`) a slide may carry: the posts mark one or two words. */
export const SHAREPIC_HAND_MARKS = 2;
/** A circle goes round a word or two, never a phrase. */
const KREIS_MAX_WORDS = 3;
const KREIS_MAX_CHARS = 24;
const UNTERSTRICH_MAX_CHARS = 40;

/** The texts that may carry hand marks: the ones the composer sets as free text. */
function markableTexts(item: SharepicItem): string[] {
  switch (item.type) {
    case 'headline':
      return item.lines;
    case 'absatz':
    case 'text':
    case 'zitat':
      return [item.text];
    default:
      return [];
  }
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

/** What is wrong with a slide's hand marks, as messages for the model; empty when nothing. */
export function handMarkProblems(items: readonly SharepicItem[]): string[] {
  const problems: string[] = [];
  let count = 0;
  for (const item of items) {
    const markable = markableTexts(item);
    for (const text of markable) {
      for (const mark of parseHandMarks(text)) {
        count += 1;
        const shown = stripInlineMarks(mark.text);
        if (
          mark.kind === 'kreis' &&
          (shown.split(/\s+/).length > KREIS_MAX_WORDS || shown.length > KREIS_MAX_CHARS)
        ) {
          problems.push(`((${shown})) kreist zu viel ein – nur ein, zwei Schlüsselwörter.`);
        }
        if (mark.kind === 'unterstrich' && shown.length > UNTERSTRICH_MAX_CHARS) {
          problems.push(`__${shown}__ ist zu lang – nur wenige Wörter unterstreichen.`);
        }
      }
    }
    const rest = stringsOf(item).filter((s) => !markable.includes(s));
    if (rest.some((s) => stripHandMarks(s) !== s)) {
      problems.push(
        `((…)) und __…__ stehen nur in headline, absatz, text und zitat – im Element "${item.type}" weglassen.`
      );
    }
  }
  if (count > SHAREPIC_HAND_MARKS) {
    problems.push(
      `Höchstens ${SHAREPIC_HAND_MARKS} handgezeichnete Markierungen ((…)) oder __…__ pro Slide, hier sind es ${count}.`
    );
  }
  return problems;
}
