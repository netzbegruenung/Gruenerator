/**
 * The original file of an uploaded notebook document, kept after ingest so the
 * reader can open it ("Original öffnen").
 *
 * Until 11/2026 ingest deleted the upload once its text was extracted; only
 * `markdown_content` and the Qdrant chunks stayed. Now a successful manual
 * upload is moved from `uploads/pending/<user>/` (swept after 7 days) to
 * `uploads/document-originals/<userId>/<documentId><ext>`, and the relative
 * path is stored in `documents.file_path`. Wolke documents get no copy: their
 * original lives in the Wolke.
 *
 * Removed by the Papierkorb purge (`purgeDocument`) and by account deletion
 * (`cleanUpBeforeProfileDelete`) — the `documents` FK cascade never reaches files.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveDocumentUploadFormat } from '@gruenerator/contracts';

const DEFAULT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads/document-originals'
);

/** Read per call so tests can point it at a temp dir. */
export function documentOriginalsDir(): string {
  return process.env.DOCUMENT_ORIGINALS_DIR || DEFAULT_DIR;
}

/** Absolute path of a stored relative path, or `null` if it would leave the dir. */
export function resolveOriginalPath(relative: string): string | null {
  if (!relative || path.isAbsolute(relative)) return null;
  const base = documentOriginalsDir();
  const resolved = path.resolve(base, relative);
  const rel = path.relative(base, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/** Move a finished upload into the originals dir; returns the relative path to store. */
export async function keepOriginal(
  pendingPath: string,
  input: { userId: string; documentId: string; filename: string | null }
): Promise<string> {
  const ext = resolveDocumentUploadFormat(input.filename)?.extension ?? '';
  const relative = `${input.userId}/${input.documentId}${ext}`;
  const target = resolveOriginalPath(relative);
  if (!target) throw new Error(`Invalid original path for document ${input.documentId}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(pendingPath, target);
  return relative;
}

export async function removeOriginal(relative: string | null): Promise<void> {
  if (!relative) return;
  const target = resolveOriginalPath(relative);
  if (!target) return;
  await fs.rm(target, { force: true });
}

export async function removeUserOriginals(userId: string): Promise<void> {
  const target = resolveOriginalPath(userId);
  if (!target) return;
  await fs.rm(target, { recursive: true, force: true });
}

/** `encodeURIComponent` leaves `'()*` alone; in `filename*` the quote ends the charset prefix. */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Headers for serving an original. The type comes from the extension table,
 * never from the client-supplied mimetype; only PDFs and images open inline,
 * everything else downloads. `sandbox` keeps an inline file from running
 * script on our origin.
 */
export function originalResponseHeaders(
  filename: string | null,
  mimetype: string | null
): Record<string, string> {
  const format = resolveDocumentUploadFormat(filename, mimetype);
  const contentType = format?.mimeTypes[0] ?? 'application/octet-stream';
  const inline = contentType === 'application/pdf' || contentType.startsWith('image/');
  const name = filename?.trim() || `dokument${format?.extension ?? ''}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'dokument';
  return {
    'Content-Type': contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${rfc5987(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
  };
}
