/**
 * Decode HTML entities in plain text: named entities (including German
 * umlauts — the gap `stripHtmlTags` doesn't cover), decimal (`&#34;`) and hex
 * (`&#x27;`) numeric references. Entities are decoded exactly once — enough
 * to unwrap the double-encoding some search providers emit
 * (`&amp;quot;` → `&quot;` → `"`) without recursing into user-controlled input.
 * Unknown named entities are left untouched.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  sect: '§',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
};

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

function decodeNumericEntity(code: string): string | null {
  const isHex = code[1] === 'x' || code[1] === 'X';
  const codePoint = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : null;
}

function decodeOnce(text: string): string {
  return text.replace(ENTITY_RE, (match, code: string) => {
    if (code[0] === '#') return decodeNumericEntity(code) ?? match;
    return NAMED_ENTITIES[code] ?? match;
  });
}

export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return '';
  return decodeOnce(decodeOnce(text));
}
