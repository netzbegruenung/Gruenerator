/**
 * The person's answer to a reported missing Termin („Do., 20.11., 18 Uhr,
 * Kreisbüro"). The chat turns it into a revision with this instruction; the
 * creator reads the answer back out of it and holds the draft to what it
 * names — live 05.11.2026 the model set the date and left out place and weekday.
 */
import { type SharepicSlide } from '@gruenerator/contracts';

import { weekdayId, weekdaysIn } from './briefFacts.js';

const PREFIX =
  'Setz den Termin ein – Wochentag, Datum und Uhrzeit in "datum", einen genannten Ort in "ort": ';

export const terminGapInstruction = (answer: string): string => `${PREFIX}${answer}`;

/** The person's answer, when `order` is a Termin gap instruction. */
export function terminAnswer(order: string): string | null {
  return order.startsWith(PREFIX) ? order.slice(PREFIX.length) : null;
}

const DATE = /(?<!\d)\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{2,4})?/g;
const TIME = /(?<!\d)\d{1,2}(?:[:.]\d{2})?\s*(?:Uhr|h)(?!\p{L})|(?<!\d)\d{1,2}:\d{2}/giu;
const LINKING = /^(?:[,–-]|\s|(?:am|um|ab|im|in|bis|von)(?!\p{L}))+/iu;

/** What the answer names besides weekday, date and time — the place — or null. */
export function placeIn(answer: string): string | null {
  const rest = answer
    .replace(DATE, ' ')
    .replace(TIME, ' ')
    .split(/(\s+)/)
    .filter((word) => !weekdayId(word.replace(/[,]$/, '')))
    .join('')
    .replace(/\s+/g, ' ')
    // Leftover connectors between the dropped parts: „, , im …“, „am , um“.
    .replace(/(?:^|\s)(?:am|um|ab|bis)(?=\s*(?:,|$))/giu, ' ')
    .replace(LINKING, '')
    .replace(/[\s,–-]+$/, '')
    .trim();
  return /\p{L}{3}/u.test(rest) ? rest : null;
}

/** Why the revised draft does not carry what the answer names, or null. */
export function terminGapProblems(
  answer: string,
  slides: readonly Pick<SharepicSlide, 'ort' | 'datum'>[]
): string | null {
  const problems: string[] = [];
  const place = placeIn(answer);
  if (place && !slides.some((s) => s.ort)) {
    problems.push(
      `Der Auftrag nennt den Ort „${place}“: setz ihn als "ort": {"lines": [Name, Adresse]} auf die Slide mit dem Datum.`
    );
  }
  if (weekdaysIn(answer).size && !slides.some((s) => s.datum?.weekday)) {
    problems.push('Der Auftrag nennt den Wochentag: setz ihn in "datum" als "weekday".');
  }
  return problems.length ? problems.join(' ') : null;
}
