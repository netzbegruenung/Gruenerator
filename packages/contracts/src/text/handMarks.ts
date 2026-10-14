/**
 * Hand-drawn marks in sharepic creator texts: `((Wort))` circles a word,
 * `__Wort__` underlines it, as the AT posts mark the key word by hand
 * (a loose ellipse, a brush stroke). The composer turns each into a shape over
 * the text; the text itself shows the words without the marks.
 *
 * Only the creator reads them: elsewhere `__x__` stays bold (`inlineMarks.ts`).
 * Linear scan, no regex. A mark opens only before a non-space and closes only
 * behind one; `__` neither opens behind nor closes before a word character
 * (`snake__case`). Unpaired marks stay literal.
 */

export type HandMarkKind = 'kreis' | 'unterstrich';

export interface HandMark {
  kind: HandMarkKind;
  /** The marked words, without the marks. */
  text: string;
}

const DELIMS: Record<HandMarkKind, [string, string]> = {
  kreis: ['((', '))'],
  unterstrich: ['__', '__'],
};
const KINDS = Object.keys(DELIMS) as HandMarkKind[];

const isSpace = (char: string | undefined): boolean =>
  char === undefined || char === ' ' || char === '\t' || char === '\n';
const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

interface Span {
  kind: HandMarkKind;
  open: number;
  close: number;
}

function canOpen(text: string, at: number, kind: HandMarkKind): boolean {
  const next = text[at + 2];
  if (isSpace(next)) return false;
  return kind !== 'unterstrich' || !isWordChar(text[at - 1]);
}

function canClose(text: string, at: number, kind: HandMarkKind): boolean {
  if (isSpace(text[at - 1])) return false;
  return kind !== 'unterstrich' || !isWordChar(text[at + 2]);
}

/** Matched pairs, in text order; a pair never spans a line break and never nests. */
function spans(text: string): Span[] {
  const found: Span[] = [];
  let open: { kind: HandMarkKind; at: number } | null = null;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '\n') {
      open = null;
      continue;
    }
    if (open) {
      const [, close] = DELIMS[open.kind];
      if (text.startsWith(close, at) && canClose(text, at, open.kind) && at > open.at + 2) {
        found.push({ kind: open.kind, open: open.at, close: at });
        open = null;
        at += 1;
      }
      continue;
    }
    const kind = KINDS.find((k) => text.startsWith(DELIMS[k][0], at) && canOpen(text, at, k));
    if (kind) {
      open = { kind, at };
      at += 1;
    }
  }
  return found;
}

/** The marked passages of a text, in order. */
export function parseHandMarks(text: string): HandMark[] {
  return spans(text).map(({ kind, open, close }) => ({ kind, text: text.slice(open + 2, close) }));
}

/**
 * Rewrites every matched pair with `wrap` (the composer swaps the marks for
 * invisible sentinels); the text between pairs stays as it is.
 */
export function replaceHandMarks(
  text: string,
  wrap: (kind: HandMarkKind, inner: string) => string
): string {
  let out = '';
  let pos = 0;
  for (const { kind, open, close } of spans(text)) {
    out += text.slice(pos, open) + wrap(kind, text.slice(open + 2, close));
    pos = close + 2;
  }
  return out + text.slice(pos);
}

/** The text without its hand marks. */
export const stripHandMarks = (text: string): string => replaceHandMarks(text, (_, inner) => inner);

/** True when a `((` or `))` is left without its partner. */
export function hasUnpairedHandMark(text: string): boolean {
  const rest = replaceHandMarks(text, () => ' ');
  return rest.includes('((') || rest.includes('))');
}
