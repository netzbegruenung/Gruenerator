/**
 * Datei-Fingerprint für Binärquellen (PDFs), damit eine Datei nur einmal
 * ausgelesen wird.
 *
 * Die Dedup-Prüfung der Scraper hing bisher am Hash des *extrahierten Texts*.
 * Der liegt aber erst vor, nachdem die teure Arbeit schon getan ist: Download,
 * PDF.js-Parse und — bei gescannten Dokumenten — ein Mistral-OCR-Lauf, der pro
 * Seite abgerechnet wird. Ein unverändertes PDF kostete damit in jedem
 * nächtlichen Lauf den vollen OCR-Preis und wurde erst danach als „unchanged"
 * verworfen.
 *
 * Zwei Stufen greifen davor:
 *   1. Bedingter GET mit `If-None-Match`/`If-Modified-Since` aus den gespeicherten
 *      Validatoren. Antwortet der Server mit 304, entfällt schon der Download.
 *   2. SHA-256 über die rohen Bytes. Stimmt er mit dem gespeicherten `file_hash`
 *      überein, ist die Extraktion nachweislich überflüssig.
 *
 * Stufe 2 ist die verlässliche: viele CMS-Uploads liefern keinen stabilen ETag,
 * und `Last-Modified` wandert beim bloßen Neu-Deploy eines Uploads-Verzeichnisses.
 * Stufe 1 spart zusätzlich Bandbreite, wo der Server mitspielt.
 */
import crypto from 'crypto';

/** Payload-Schlüssel, unter denen der Fingerprint am Qdrant-Punkt hängt. */
export const FILE_HASH_KEY = 'file_hash';
export const SOURCE_ETAG_KEY = 'source_etag';
export const SOURCE_LAST_MODIFIED_KEY = 'source_last_modified';

/**
 * Der Index-Signatur-Teil ist Absicht: der Fingerprint wird als Payload-Fragment
 * in Qdrant-Punkte gemischt, und die Aufrufer nehmen dort `Record<string, unknown>`.
 */
export interface FileFingerprint extends Record<string, string | undefined> {
  [FILE_HASH_KEY]: string;
  [SOURCE_ETAG_KEY]?: string;
  [SOURCE_LAST_MODIFIED_KEY]?: string;
}

/** SHA-256 der rohen Bytes, hex. */
export function hashBytes(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Fingerprint aus heruntergeladenen Bytes plus den HTTP-Validatoren der Antwort.
 * Fehlende Validatoren werden weggelassen statt auf `null` gesetzt — ein Punkt
 * ohne ETag soll beim nächsten Lauf keinen `If-None-Match: null` senden.
 */
export function fingerprintResponse(bytes: Uint8Array, response: Response): FileFingerprint {
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  return {
    [FILE_HASH_KEY]: hashBytes(bytes),
    ...(etag ? { [SOURCE_ETAG_KEY]: etag } : {}),
    ...(lastModified ? { [SOURCE_LAST_MODIFIED_KEY]: lastModified } : {}),
  };
}

/**
 * `If-None-Match`/`If-Modified-Since` aus einem gespeicherten Payload.
 * Leer, wenn nichts gespeichert ist — dann läuft der Download normal.
 */
export function conditionalHeaders(
  storedPayload: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!storedPayload) return {};
  const headers: Record<string, string> = {};
  const etag = storedPayload[SOURCE_ETAG_KEY];
  const lastModified = storedPayload[SOURCE_LAST_MODIFIED_KEY];
  if (typeof etag === 'string' && etag.length > 0) headers['If-None-Match'] = etag;
  if (typeof lastModified === 'string' && lastModified.length > 0) {
    headers['If-Modified-Since'] = lastModified;
  }
  return headers;
}

/**
 * True, wenn die frisch geladenen Bytes byte-gleich zu den gespeicherten sind.
 *
 * Punkte ohne `file_hash` (alle vor diesem Fingerprint indizierten) liefern
 * false: sie werden einmal ausgelesen und tragen danach ihren Hash, siehe das
 * Nachtragen auf dem `unchanged`-Pfad im DocumentProcessor.
 */
export function isSameFile(
  storedPayload: Record<string, unknown> | null | undefined,
  fingerprint: FileFingerprint
): boolean {
  if (!storedPayload) return false;
  const stored = storedPayload[FILE_HASH_KEY];
  return typeof stored === 'string' && stored.length > 0 && stored === fingerprint[FILE_HASH_KEY];
}
