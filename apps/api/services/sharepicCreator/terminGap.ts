/**
 * The person's answer to a reported missing Termin („Do., 20.11., 18 Uhr,
 * Kreisbüro"). The chat turns it into a revision with this instruction; the
 * creator reads the answer back out of it and puts what it names on the card.
 */
import { SHAREPIC_LIMITS, type SharepicSpec } from '@gruenerator/contracts';

import { hasTermin, weekdayId, weekdaysIn } from './briefFacts.js';

const PREFIX =
  'Setz den Termin ein – Wochentag, Datum und Uhrzeit in "datum", einen genannten Ort in "ort": ';

export const terminGapInstruction = (answer: string): string => `${PREFIX}${answer}`;

/** The person's answer, when `order` is a Termin gap instruction. */
export function terminAnswer(order: string): string | null {
  return order.startsWith(PREFIX) ? order.slice(PREFIX.length) : null;
}

/**
 * The Termin a revision fills in: the chat's gap instruction, or — the Studio
 * sends the person's words as they are — a day named for a card that carries
 * no date at all, which is where the report said „Termin fehlt“.
 */
export function terminAnswerOf(
  order: string,
  current: Pick<SharepicSpec, 'slides'> | null
): string | null {
  const gap = terminAnswer(order);
  if (gap) return gap;
  return current && !current.slides.some((slide) => slide.datum) && hasTermin(order) ? order : null;
}

const DATE = /(?<!\d)\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{2,4})?/g;
const TIME = /(?<!\d)\d{1,2}(?:[:.]\d{2})?\s*(?:Uhr|h)(?!\p{L})|(?<!\d)\d{1,2}:\d{2}/giu;
const LINKING = /^(?:[,–-]|\s|(?:am|um|ab|im|in|bis|von)(?!\p{L}))+/iu;
const bare = (word: string) => word.replace(/,$/, '');
const PLACE_LINKS = new Set([
  'am',
  'an',
  'auf',
  'bei',
  'der',
  'die',
  'das',
  'dem',
  'den',
  'im',
  'in',
  'vor',
  'zum',
  'zur',
  'und',
  'online',
]);

/** What the answer names besides weekday, date and time — the place — or null. */
export function placeIn(answer: string): string | null {
  const rest = answer
    .replace(DATE, ' ')
    .replace(TIME, ' ')
    .split(/(\s+)/)
    .filter((word) => !weekdayId(bare(word)))
    .join('')
    .replace(/\s+/g, ' ')
    // Leftover connectors between the dropped parts: „, , im …“, „am , um“.
    .replace(/(?:^|\s)(?:am|um|ab|bis)(?=\s*(?:,|$))/giu, ' ')
    .replace(LINKING, '')
    .replace(/[\s,–-]+$/, '')
    .trim();
  // A place is names and numbers: „und mach die Headline grün“ after the date is a wish, not a place.
  const words = rest.split(/[\s,]+/).filter(Boolean);
  const placeLike = words.every((w) => /^[\p{Lu}\d]/u.test(w) || PLACE_LINKS.has(w.toLowerCase()));
  return /\p{L}{3}/u.test(rest) && placeLike ? rest : null;
}

/** „Bürgerhaus Linden, Am Lindenplatz 4“ → name and address; null when a line would not fit. */
function placeLines(place: string): string[] | null {
  const [name, ...address] = place.split(/,\s*/);
  const lines = [name!, address.join(', ')].filter(Boolean);
  return lines.every((line) => line.length <= SHAREPIC_LIMITS.ortLine) ? lines : null;
}

/**
 * Puts the weekday and place the answer names in the circle's slide when the
 * draft left them out. Under a forced tool call Gemma drops `datum` fields and
 * `ort` even when told (live 05.11.2026: three attempts, none set `ort`), so
 * the program does it — as `withOrderedDate`/`withOrderedTime` do for date and time.
 */
export function withTerminAnswer(spec: SharepicSpec, answer: string | null): SharepicSpec {
  const at = answer ? spec.slides.findIndex((slide) => slide.datum) : -1;
  if (!answer || at < 0) return spec;
  const slide = spec.slides[at]!;
  const named =
    weekdaysIn(answer).size === 1
      ? answer
          .split(/\s+/)
          .map(bare)
          .find((word) => weekdayId(word))
      : undefined;
  const place = spec.slides.some((s) => s.ort) ? null : placeIn(answer);
  const lines = place ? placeLines(place) : null;
  if ((slide.datum!.weekday || !named) && !lines) return spec;
  const next = {
    ...slide,
    datum: { ...slide.datum!, ...(!slide.datum!.weekday && named && { weekday: named }) },
    ...(lines && { ort: { lines } }),
  };
  return { ...spec, slides: spec.slides.map((s, i) => (i === at ? next : s)) };
}
