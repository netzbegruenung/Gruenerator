import { markerCanOpenAt, parseInlineMarks } from '../../text/inlineMarks.js';

/** One `++marker++` passage per pair; a slide may carry at most this many (DE only). */
export const SHAREPIC_MARKER_PASSAGES = 2;

/** `C++` is text, not a marker: the one word-bound rule the inline parser uses too. */
const isOpener = (text: string, at: number, mark: '==' | '++') =>
  mark === '==' || markerCanOpenAt(text, at);

/** Tightens whitespace just inside every matched `<mark>…<mark>` pair of one delimiter. */
function tightenPairs(text: string, mark: '==' | '++'): string {
  let out = '';
  let pos = 0;
  let from = 0;
  for (;;) {
    const open = text.indexOf(mark, from);
    if (open !== -1 && !isOpener(text, open, mark)) {
      from = open + 2;
      continue;
    }
    const close = open === -1 ? -1 : text.indexOf(mark, open + 2);
    if (close === -1) return out + text.slice(pos);
    const inner = text.slice(open + 2, close).trim();
    out += inner ? `${text.slice(pos, open)}${mark}${inner}${mark}` : text.slice(pos, close + 2);
    pos = close + 2;
    from = pos;
  }
}

/**
 * Tightens whitespace just inside a matched `==…==` or `++…++` pair: `== x ==`,
 * `==x ==` and `== x==` become `==x==`. The inline tokenizer only closes a mark
 * behind a non-space, so a model's `==Mach mit! ==` would otherwise render
 * literally. Linear scan, no regex; an unpaired mark stays and is rejected by
 * the draft validation.
 */
export function tightenAccentMarks(text: string): string {
  return tightenPairs(tightenPairs(text, '=='), '++');
}

/**
 * True when a `==` or `++` is left without its partner, or the marks cross
 * (`++a ==b++ c==`) — nothing can repair that by whitespace. Judged by the
 * inline parser itself: whatever it leaves as literal mark characters is
 * stray, except a `++` glued to a word (`C++`), which is text.
 */
export function hasUnpairedAccentMark(text: string): boolean {
  return text.split('\n').some((line) => {
    const shown = parseInlineMarks(line)
      .map((run) => run.text)
      .join('');
    return shown.includes('==') || strayPlusPlus(shown);
  });
}

function strayPlusPlus(text: string): boolean {
  for (let at = text.indexOf('++'); at !== -1; at = text.indexOf('++', at + 2)) {
    if (markerCanOpenAt(text, at)) return true;
  }
  return false;
}

/** How many `++marker++` passages a text carries: stretches of marked runs, per line. */
export function countMarkerPassages(text: string): number {
  let passages = 0;
  for (const line of text.split('\n')) {
    let inside = false;
    for (const run of parseInlineMarks(line)) {
      if (run.marker && !inside) passages += 1;
      inside = run.marker;
    }
  }
  return passages;
}

/**
 * A model sometimes writes a line break as the two characters `\n` (JSON
 * escaped twice); the canvas would print them. They become one space — no
 * field of a slide wants a hard break the model typed as text.
 */
export function unescapeLiteralNewlines(text: string): string {
  return text.includes('\\')
    ? // Two linear passes: a leading `[ \t]*` before the escape would backtrack quadratically.
      text.replace(/(?:\\r)?\\n/g, ' ').replace(/[ \t]{2,}/g, ' ')
    : text;
}

/**
 * Applies `unescapeLiteralNewlines` and `tightenAccentMarks` to every string of
 * a spec or patch op, whatever its field — ids, filenames and colours never
 * contain `==` or a backslash, so a blanket walk cannot touch them and cannot
 * miss a text field added later.
 */
export function tightenAccentMarksDeep<T>(value: T): T {
  if (typeof value === 'string') return tightenAccentMarks(unescapeLiteralNewlines(value)) as T;
  if (Array.isArray(value)) return value.map(tightenAccentMarksDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, tightenAccentMarksDeep(v)])
    ) as T;
  }
  return value;
}
