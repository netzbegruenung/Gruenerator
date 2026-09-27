/**
 * Dateitypen für hochgeladene Anhänge (Board-Karten, Gruppen-Beiträge). Der
 * MIME-Typ kommt immer aus der Endung, nie aus der Angabe des Clients.
 */
import path from 'path';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

export function lookupMime(filename: string): string {
  return MIME_MAP[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

/**
 * Types safe to serve with `Content-Disposition: inline`. Excludes SVG (can
 * carry <script>) and anything not in MIME_MAP (would only get here via a
 * client-supplied mimetype we no longer trust) — those must download instead
 * of rendering in the API's origin, or a malicious upload becomes stored XSS.
 */
const INLINE_SAFE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export function isSafeToInline(mimeType: string): boolean {
  return INLINE_SAFE_TYPES.has(mimeType);
}

/** Endung steht in der Liste oben — sonst wäre der Typ nur geraten. */
export function isKnownAttachmentType(filename: string): boolean {
  return Object.hasOwn(MIME_MAP, path.extname(filename).toLowerCase());
}
