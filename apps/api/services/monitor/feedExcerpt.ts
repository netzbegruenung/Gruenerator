/**
 * Teaser text for a feed article, built from its stored `full_text` (#5433).
 *
 * Measured against the live LV corpus (120 articles, 25.10.–07.11.2026): no
 * `full_text` starts with a `#` heading, but many start with lines the card
 * already shows or that carry no content — the title itself (Grüne Fraktion
 * Hessen every time, Sachsen-Anhalt twice in a row), a bare date
 * (`29. Oktober 2026`, `03.11.26 –`) or an image credit (`Foto: …`). Those
 * leading lines are dropped. A title only counts when it fills the whole line:
 * Instagram titles are the caption cut with `…`, and stripping them as a
 * prefix would leave a half word.
 *
 * The excerpt then ends at the last full sentence within `maxChars`, or at a
 * word boundary with `…` when no sentence ends late enough.
 */

const DATE_LINE = /^\d{1,2}\.\s*(?:\d{1,2}\.|[a-zäöü]+)\s*\d{2,4}\s*[–-]?$/i;
const CREDIT_LINE = /^(?:foto|bild)\s*:/i;
/** A sentence end: terminal punctuation, optional closing quote, then whitespace. */
const SENTENCE_END = /[.!?…]["“”»«']?(?=\s)/g;
/**
 * A period after these does not end a sentence: a day ordinal (`am 3. November`)
 * or a German abbreviation (`Dr. Müller`, `Art. 5`). Single letters (`z. B.`,
 * `u. a.`) are caught by the length check; a 4-digit year (`bis 2040.`) is a
 * real sentence end.
 */
const ORDINAL = /^\d{1,2}$/;
const ABBREVIATIONS = new Set([
  'abs',
  'art',
  'bzw',
  'ca',
  'dr',
  'evtl',
  'ggf',
  'hl',
  'inkl',
  'mio',
  'mrd',
  'nr',
  'prof',
  'sog',
  'st',
  'usw',
  'vgl',
]);
/** What follows a real sentence end: neither a lowercase letter nor a digit (`ca. 40`, `u. a. die`). */
const CONTINUATION = /^\s+[\p{Ll}\d]/u;
/** A sentence cut shorter than this share of the budget reads as too thin; cut at a word instead. */
const MIN_SENTENCE_SHARE = 0.4;

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether the period at `index` is an ordinal or abbreviation rather than a sentence end. */
function isNonTerminalPeriod(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const token = (text.slice(0, index).match(/(\S+)$/)?.[1] ?? '').replace(/^[(„"“»«']+/, '');
  if (token.length <= 1 || ORDINAL.test(token) || ABBREVIATIONS.has(token.toLowerCase()))
    return true;
  return CONTINUATION.test(text.slice(index + 1));
}

function isNoiseLine(line: string, title: string): boolean {
  const l = normalize(line);
  return l === '' || l === title || DATE_LINE.test(l) || CREDIT_LINE.test(l);
}

export function buildFeedExcerpt(
  fullText: string,
  title: string | null,
  maxChars: number
): string | null {
  const normTitle = title ? normalize(title) : '';
  const lines = fullText.split(/\r?\n/);
  let start = 0;
  while (start < lines.length && isNoiseLine(lines[start], normTitle)) start++;

  const text = lines.slice(start).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= maxChars) return text;

  const head = text.slice(0, maxChars + 1);
  let sentenceEnd = -1;
  for (const m of head.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end <= maxChars && !isNonTerminalPeriod(text, m.index)) sentenceEnd = end;
  }
  if (sentenceEnd >= maxChars * MIN_SENTENCE_SHARE) return text.slice(0, sentenceEnd);

  // No space in the budget (one unbroken token, e.g. a long URL): a hard cut
  // inside the token is the only option left.
  const wordEnd = head.lastIndexOf(' ', maxChars - 1);
  return `${text.slice(0, wordEnd > 0 ? wordEnd : maxChars - 1).trimEnd()}…`;
}
