import { type SharepicItemType } from './items.js';
import { type SharepicSlide } from './slide.js';

const ORDINALS = ['erst', 'zweit', 'dritt', 'viert', 'fünft', 'sechst', 'siebt', 'acht'];
const SLIDE_NOUN = '(?:slide|folie)';
const NAMED_SLIDE = new RegExp(
  `(?:^|[^\\d])(\\d{1,2})\\.\\s*${SLIDE_NOUN}|${SLIDE_NOUN}\\s*(?:nr\\.?\\s*)?(\\d{1,2})(?!\\d)|(?:^|[^\\p{L}])(${ORDINALS.join('|')}|letzt)e[nmrs]?\\s+${SLIDE_NOUN}`,
  'giu'
);

/**
 * Item types a slide can be named by („Folie mit dem Zitat“, „die Zahlen-Folie“,
 * „beim Diagramm“). Headline, paragraph and text stand on nearly every slide
 * and name none.
 */
const CONTENT_STEMS: Partial<Record<SharepicItemType, string>> = {
  zitat: 'zitat',
  zahl: 'zahl',
  diagramm: 'diagramm',
  liste: 'liste',
  iconliste: 'icon-?liste',
  infografik: 'infografik',
  faktencheck: 'faktencheck',
  vergleich: 'vergleich',
  termine: 'termin',
  schlagzeile: 'schlagzeile',
  bingo: 'bingo',
  rechnung: 'rechnung',
  frage: 'frage',
  aufruf: 'aufruf',
  steckbrief: 'steckbrief',
};
const CONTENT_REFS = Object.entries(CONTENT_STEMS).map(([type, stem]) => {
  const word = `${stem}(?:e|en|n|s|es)?`;
  return {
    type: type as SharepicItemType,
    pattern: new RegExp(
      `${SLIDE_NOUN}\\s+mit\\s+(?:(?:de[mnr]|die|das|eine[mnr]?|ein)\\s+)?${word}(?!\\p{L})|(?:^|[^\\p{L}])${word}-?${SLIDE_NOUN}|(?:^|[^\\p{L}])(?:beim|bei\\s+(?:de[mr]|die)|im|in\\s+der|am)\\s+${word}(?!\\p{L})`,
      'iu'
    ),
  };
});

/**
 * The slides a request names as people count them — „1. Slide“, „Folie 2“,
 * „dritte Folie“, „letzte Slide“ — or by what they show („Folie mit dem
 * Zitat“: every slide with a quote), as 0-based indices. „5 Slides“ names a
 * count, not a slide.
 */
export function namedSharepicSlides(
  order: string,
  slides: readonly Pick<SharepicSlide, 'items'>[]
): number[] {
  const count = slides.length;
  const named = new Set<number>();
  for (const m of order.matchAll(NAMED_SLIDE)) {
    const word = m[3]?.toLowerCase();
    const index =
      word === 'letzt' ? count - 1 : word ? ORDINALS.indexOf(word) : Number(m[1] ?? m[2]) - 1;
    if (index >= 0 && index < count) named.add(index);
  }
  for (const { type, pattern } of CONTENT_REFS) {
    if (!pattern.test(order)) continue;
    slides.forEach((slide, i) => {
      if (slide.items.some((item) => item.type === type)) named.add(i);
    });
  }
  return [...named].sort((a, b) => a - b);
}

/** Key order is no content: a spec that went through a patch or the wire may list keys differently. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

/** Same content for the person looking at it: equal up to key order. */
export function sameSharepicContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
