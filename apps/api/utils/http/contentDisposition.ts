import type { Response } from 'express';

type Disposition = 'attachment' | 'inline';

/**
 * Build an RFC 6266 / RFC 5987 `Content-Disposition` header value.
 *
 * Node's `res.setHeader` rejects non-ASCII per RFC 7230 — any Umlaut in the
 * filename throws `ERR_INVALID_CHAR`. We emit an ASCII-sanitized `filename="…"`
 * for legacy parsers plus the standards `filename*=UTF-8''…` that modern
 * browsers prefer.
 */
export function buildContentDisposition(
  filename: string,
  disposition: Disposition = 'attachment'
): string {
  const ascii = sanitizeAsciiFilename(filename);
  const utf8 = encodeRfc5987(filename);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export function setContentDisposition(
  res: Response,
  filename: string,
  disposition: Disposition = 'attachment'
): void {
  res.setHeader('Content-Disposition', buildContentDisposition(filename, disposition));
}

function sanitizeAsciiFilename(filename: string): string {
  const cleaned = filename
    // eslint-disable-next-line no-control-regex -- intentional: strip control chars Node rejects in headers
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  return cleaned.length > 0 ? cleaned : 'download';
}

// RFC 5987 §3.2.1 attr-char excludes a few chars that encodeURIComponent leaves
// unescaped: ' ( ) *. Escape them manually so picky parsers don't choke.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}
