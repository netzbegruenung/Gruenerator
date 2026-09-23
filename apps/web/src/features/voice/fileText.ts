/**
 * Turns the text extracted from a PDF or DOCX into something worth reading aloud.
 *
 * Measured on a six-page Fraktionsbeschluss (pdfjs path of /api/scanner/extract):
 * 78 line-end hyphenations ("Verän-" / "derungen"), a page number alone on a
 * line after every page, a Markdown `#` the extractor adds to the title, and a
 * hard line break every ~100 characters. A voice pronounces all of it — the
 * page numbers as numbers, the split words as two halves.
 *
 * Everything here errs towards leaving text alone: the result lands in the
 * editor, where the person reads it before anything is synthesised.
 */

/** A line that is nothing but a page number, with the blank lines around it. */
const PAGE_NUMBER_LINE = /\n*^[ \t]*\d{1,3}[ \t]*$\n*/gm;

/**
 * A word split at the line end: the hyphen goes, the halves join. Only when the
 * next line continues in lowercase — "Elektro-" / "LKW" is a real hyphen — and
 * never before a conjunction, where "Rad- und Fußverkehr" means what it says.
 * PDF kerning sometimes puts a space before the hyphen ("automati -").
 */
const LINE_END_HYPHEN = /(\p{L}) ?-\n(?!(?:und|oder|bis|sowie)\b)(\p{Ll})/gu;

/** Extractor markup a voice would read out: headings, bold, OCR image refs. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Joins lines the layout broke, keeps the ones the author broke.
 *
 * A line is a layout wrap when it runs close to the full column width and does
 * not end a sentence. Width is judged against the document's own median line,
 * so an A5 flyer is measured against A5 lines. A short line without a full stop
 * is a heading ("Grün wirkt") and keeps its break — joining it would read the
 * heading straight into the next sentence.
 */
function unwrapLines(text: string): string {
  const lines = text.split('\n');
  const minWrapLength = 0.6 * median(lines.filter((l) => l.trim() !== '').map((l) => l.length));
  let out = lines[0] ?? '';
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1] ?? '';
    const line = lines[i] ?? '';
    const wrapped =
      prev.trim() !== '' &&
      line.trim() !== '' &&
      prev.length >= minWrapLength &&
      !/[.!?:;]$/.test(prev.trimEnd());
    // "Elektro-" / "LKW" is one word; "Rad-" / "und" is two.
    const glued = /-$/.test(prev) && /^\p{Lu}/u.test(line);
    out += wrapped ? `${glued ? '' : ' '}${line}` : `\n${line}`;
  }
  return out;
}

export function prepareExtractedText(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
  text = text.replace(PAGE_NUMBER_LINE, '\n');
  text = text.replace(LINE_END_HYPHEN, '$1$2');
  // Headings are recognised by their marker before it is stripped, so neither
  // neighbour gets joined onto one.
  text = text.replace(/^(#{1,6}[ \t].*)$/gm, '\n$1\n');
  text = unwrapLines(stripMarkdown(text));
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
