/**
 * Charset-Erkennung und Dekodierung für RSS/XML-Feeds (#6078).
 *
 * `rss-parser.parseURL` dekodiert den Body über `res.setEncoding(...)` und liest
 * dabei nur den `charset`-Parameter des Content-Type — fehlt der, landet alles
 * in UTF-8, egal was die XML-Deklaration sagt. Feeds wie nachrichten.at
 * (`content-type: application/xml` ohne charset, `encoding='ISO-8859-15'` in
 * der Deklaration, live geprüft 25.11.2026) kommen so mit U+FFFD statt Umlauten
 * an. Deshalb fetchen wir die Bytes selbst und dekodieren mit TextDecoder.
 */

/** charset-Parameter aus einem Content-Type-Header. */
const CHARSET_PARAM = /charset\s*=\s*"?([^;\s"']+)/i;
/** encoding-Attribut der XML-Deklaration. */
const XML_ENCODING = /<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/i;

export function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  return contentType.match(CHARSET_PARAM)?.[1] ?? null;
}

/**
 * Encoding aus der XML-Deklaration. Die Deklaration steht in den ersten Bytes
 * und ist in allen für uns relevanten Encodings ASCII-kompatibel — latin1 hält
 * die Bytes 1:1, damit das Regex den Encoding-Namen matchen kann.
 */
export function charsetFromXmlDeclaration(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256));
  return head.match(XML_ENCODING)?.[1] ?? null;
}

function makeDecoder(charset: string): TextDecoder {
  try {
    return new TextDecoder(charset);
  } catch {
    // Unbekanntes Label (z. B. hauseigene Aliase) → UTF-8.
    return new TextDecoder('utf-8');
  }
}

/**
 * Feed-Bytes dekodieren. Priorität wie in #6078: charset aus dem Content-Type,
 * sonst die XML-Deklaration, sonst UTF-8. Ein führender BOM wird vom
 * TextDecoder entfernt.
 */
export function decodeFeedBytes(bytes: Uint8Array, contentType: string | null): string {
  const charset =
    charsetFromContentType(contentType) ?? charsetFromXmlDeclaration(bytes) ?? 'utf-8';
  return makeDecoder(charset).decode(bytes);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const HAS_ENTITY_REF = /&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/;
const ENTITY_REF = /&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g;

function decodeEntityRefs(text: string): string {
  return text.replace(ENTITY_REF, (match, body: string) => {
    const named = NAMED_ENTITIES[body];
    if (named) return named;
    const codePoint =
      body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return match;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

/**
 * Doppelt-escapte Entities auflösen (#6078). Manche Feeds (ndr.de,
 * tagesspiegel.de) liefern `&amp;amp;` statt `&amp;` — nach dem XML-Parse
 * bleibt `&amp;` im Titel stehen. Nur einmal nachdekodieren, wenn überhaupt
 * noch Entity-Referenzen im Text sind, damit normal dekodierte Titel
 * (`AT&T`) unangetastet bleiben.
 */
export function fixDoubleEscapedEntities(text: string): string {
  return HAS_ENTITY_REF.test(text) ? decodeEntityRefs(text) : text;
}
