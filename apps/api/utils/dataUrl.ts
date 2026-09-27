/**
 * Node-Seite des Data-URL-Parsers: dieselbe Zerlegung wie in
 * `@gruenerator/shared/utils`, nur mit `Buffer` — den es im Browser nicht gibt.
 *
 * Wer im Backend eine Data-URL in Bytes braucht, nimmt das hier. Ein eigener
 * Regex ist nie die Antwort (ESLint blockt ihn, siehe `no-restricted-syntax`
 * in packages/eslint-config/base.js).
 */
import { decodedByteLength, parseDataUrl } from '@gruenerator/shared/utils';

export interface DecodedDataUrl {
  /** z. B. `image/png` — ohne Parameter, klein geschrieben. */
  mediaType: string;
  buffer: Buffer;
}

export interface DecodeDataUrlOptions {
  /** Obergrenze der dekodierten Groesse. Darueber gibt es `null` statt Buffer. */
  maxBytes?: number;
  /** Nur diese Medientyp-Familie zulassen, z. B. `image`. */
  expectedType?: string;
}

/**
 * Dekodiert eine base64-Data-URL zu einem Buffer. `null`, wenn der String
 * keine wohlgeformte Data-URL ist, der Medientyp nicht passt oder der Payload
 * die Groessengrenze reisst — die Groesse wird *vor* der Allokation geprueft.
 */
export function decodeDataUrl(
  input: string,
  options: DecodeDataUrlOptions = {}
): DecodedDataUrl | null {
  const parsed = parseDataUrl(input);
  if (!parsed) return null;

  if (options.expectedType && !parsed.mediaType.startsWith(`${options.expectedType}/`)) {
    return null;
  }

  if (options.maxBytes !== undefined && decodedByteLength(parsed.base64) > options.maxBytes) {
    return null;
  }

  return { mediaType: parsed.mediaType, buffer: Buffer.from(parsed.base64, 'base64') };
}

/**
 * Wie {@link decodeDataUrl}, akzeptiert zusaetzlich rohes base64 ohne Header —
 * dann greift `fallbackMediaType`.
 */
export function decodeBase64OrDataUrl(
  input: string,
  fallbackMediaType: string,
  options: DecodeDataUrlOptions = {}
): DecodedDataUrl | null {
  const parsed = parseDataUrl(input);
  if (parsed) return decodeDataUrl(input, options);
  if (input.startsWith('data:')) return null;

  if (options.maxBytes !== undefined && decodedByteLength(input) > options.maxBytes) return null;
  return { mediaType: fallbackMediaType, buffer: Buffer.from(input, 'base64') };
}
