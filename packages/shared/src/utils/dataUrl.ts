/**
 * Data-URL-Parsing — die einzige Stelle, an der `data:<mime>;base64,<payload>`
 * zerlegt wird.
 *
 * Kernregel: **Der Payload kommt nie in eine Regex-Engine.** Der Header wird
 * aus einem laengenbegrenzten Prefix gelesen, der Payload nur per `slice`
 * herausgeschnitten. Ein greedy `(.+)$` ueber einen mehrere MB grossen Payload
 * kippt in V8 mit `RangeError: Maximum call stack size exceeded` — und zwar
 * groessenabhaengig, also nie in einem Test mit Mini-Fixture.
 */

/** Laenger als das darf ein Data-URL-Header nicht sein (RFC-konform reichen ~80). */
const HEADER_MAX_LENGTH = 256;

const BASE64_MARKER = ';base64,';

/** Bewusst eng: type/subtype mit den RFC-2045-Zeichen, keine Parameter. */
const MEDIA_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

/** Fallback laut RFC 2397, wenn die URL keinen Medientyp nennt. */
const DEFAULT_MEDIA_TYPE = 'text/plain';

export interface ParsedDataUrl {
  /** z. B. `image/png` — ohne Parameter, immer klein geschrieben. */
  mediaType: string;
  /** Der rohe base64-Payload, ohne Header. */
  base64: string;
}

/** Ob der String wie eine Data-URL aussieht (sagt nichts ueber Wohlgeformtheit). */
export function isDataUrl(input: string): boolean {
  return typeof input === 'string' && input.startsWith('data:');
}

/**
 * Zerlegt eine base64-kodierte Data-URL. Gibt `null` zurueck, wenn der String
 * keine ist oder der Header nicht wohlgeformt ist (fehlendes `;base64,`,
 * unplausibler Medientyp, leerer Payload).
 */
export function parseDataUrl(input: string): ParsedDataUrl | null {
  if (!isDataUrl(input)) return null;

  // Nur der Prefix wird durchsucht — damit ist die Payload-Groesse strukturell
  // aus jedem Scan heraus, egal wie gross sie wird.
  const header = input.slice(0, HEADER_MAX_LENGTH);
  const markerAt = header.indexOf(BASE64_MARKER);
  if (markerAt === -1) return null;

  const parameters = input.slice('data:'.length, markerAt);
  const semicolonAt = parameters.indexOf(';');
  const rawMediaType = semicolonAt === -1 ? parameters : parameters.slice(0, semicolonAt);
  const mediaType = rawMediaType.length === 0 ? DEFAULT_MEDIA_TYPE : rawMediaType.toLowerCase();
  if (!MEDIA_TYPE_PATTERN.test(mediaType)) return null;

  const base64 = input.slice(markerAt + BASE64_MARKER.length);
  if (base64.length === 0) return null;

  return { mediaType, base64 };
}

/**
 * Holt den base64-Anteil aus einer Data-URL. Ein String, der keine Data-URL
 * ist, gilt als roher base64-Payload und kommt unveraendert zurueck.
 *
 * @throws wenn der String mit `data:` beginnt, aber kein wohlgeformter
 *         base64-Header folgt.
 */
export function extractBase64(input: string): string {
  if (!isDataUrl(input)) return input;

  const parsed = parseDataUrl(input);
  if (!parsed) throw new Error('Invalid data URL format');
  return parsed.base64;
}

/**
 * Nachsichtige Variante von {@link extractBase64}: schneidet einen
 * Data-URL-Header ab, laesst alles andere unveraendert — auch eine kaputte
 * Data-URL. Fuer Aufrufer, die den String nur "sauber" haben wollen und einen
 * Fehler erst beim Dekodieren sehen (das Verhalten der frueheren
 * `replace(/^data:...;base64,/, '')`-Einzeiler).
 */
export function stripDataUrlPrefix(input: string): string {
  const parsed = parseDataUrl(input);
  return parsed ? parsed.base64 : input;
}

/**
 * Dekodierte Groesse eines base64-Payloads in Bytes — ohne ihn zu dekodieren.
 * Fuer Groessenpruefungen, die *vor* der Allokation greifen sollen.
 */
export function decodedByteLength(base64: string): number {
  if (base64.length === 0) return 0;
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}
