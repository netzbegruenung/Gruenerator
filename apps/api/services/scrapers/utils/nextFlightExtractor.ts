/**
 * Extract article text from a Next.js App Router page (React Flight payload).
 *
 * gruene.de renders as a client-side Next.js app: the initial HTML contains no
 * <article>/<main> markup, only `self.__next_f.push([1,"..."])` script chunks
 * carrying the React Flight stream. Long text content is embedded as T-rows:
 * `<id>:T<hexByteLength>,<utf8 text of exactly that byte length>`.
 *
 * This parser joins all flight chunks and walks the stream byte-accurately to
 * pull out those text rows — no headless browser needed.
 */

const FLIGHT_PUSH_RE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** Join all flight string chunks embedded in the page HTML. */
export function extractFlightStream(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(FLIGHT_PUSH_RE)) {
    try {
      chunks.push(JSON.parse(match[1]) as string);
    } catch {
      // skip malformed chunk
    }
  }
  return chunks.join('');
}

/**
 * Extract all T-row text segments from a flight stream.
 * Rows have the shape `<hexId>:T<hexByteLen>,<text>`; the length is in UTF-8
 * bytes, so slicing must happen on a Buffer, not the JS string.
 */
export function extractFlightTexts(flight: string): string[] {
  const buf = Buffer.from(flight, 'utf8');
  const texts: string[] = [];
  let i = 0;

  while (i < buf.length) {
    // find start of a row: beginning of buffer or after '\n'
    const rowStart = i;
    // read row id (hex) up to ':'
    let j = rowStart;
    while (j < buf.length && isHexByte(buf[j])) j++;
    if (
      j > rowStart &&
      j < buf.length &&
      buf[j] === 0x3a /* ':' */ &&
      buf[j + 1] === 0x54 /* 'T' */
    ) {
      // read hex byte length up to ','
      let k = j + 2;
      const lenStart = k;
      while (k < buf.length && isHexByte(buf[k])) k++;
      if (k > lenStart && buf[k] === 0x2c /* ',' */) {
        const byteLen = parseInt(buf.toString('ascii', lenStart, k), 16);
        const textStart = k + 1;
        const textEnd = Math.min(textStart + byteLen, buf.length);
        texts.push(buf.toString('utf8', textStart, textEnd));
        i = textEnd;
        continue;
      }
    }
    // not a T-row: skip to the byte after the next newline
    const nl = buf.indexOf(0x0a, rowStart);
    if (nl === -1) break;
    i = nl + 1;
  }

  return texts;
}

function isHexByte(b: number): boolean {
  return (b >= 0x30 && b <= 0x39) || (b >= 0x61 && b <= 0x66);
}

/** Strip HTML tags and collapse whitespace in a flight text fragment. */
export function flightTextToPlain(fragment: string): string {
  // Entities are decoded before tag stripping (with &amp; last, so nothing is
  // double-unescaped); tags formed by decoded entities are stripped too.
  const withBreaks = fragment
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<br\s*\/?>/gi, ' ');

  return stripTagsToFixpoint(withBreaks).replace(/\s+/g, ' ').trim();
}

/**
 * Strip tags repeatedly until nothing changes, then drop any leftover angle
 * brackets. A single regex pass can leave fragments that recombine into a tag
 * once chunks are concatenated — and chunk_text is rendered through
 * rehype-raw downstream, which parses embedded HTML rather than escaping it.
 */
function stripTagsToFixpoint(input: string): string {
  let current = input;
  for (let i = 0; i < 5; i++) {
    const next = current
      .replace(/<\/(p|li|h[1-6]|blockquote|div)>/gi, ' ')
      .replace(/<[^>]*>/g, ' ');
    if (next === current) break;
    current = next;
  }
  return current.replace(/[<>]/g, ' ');
}
