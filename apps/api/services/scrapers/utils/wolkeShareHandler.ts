/**
 * Wolke (Nextcloud) public-share content handler.
 *
 * Reusable bridge that lets a scraper pull documents from a public
 * `wolke.netzbegruenung.de/s/<token>` share as a content source. Wraps the
 * existing NextcloudApiClient (WebDAV over public.php/webdav, share token as
 * Basic-auth username) — no new auth code. The etag returned by the WebDAV
 * PROPFIND is the dedup key the caller compares against the stored payload so an
 * unchanged file is skipped BEFORE the expensive download + OCR (i.e. hourly
 * runs never re-OCR a file that hasn't changed).
 *
 * Not LV-specific: any scraper/notebook can call `collectWolkeShareFiles` +
 * `extractWolkeFileText` and route the text into its own storage pipeline.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import NextcloudApiClient, { type NextcloudFile } from '../../api-clients/nextcloudApiClient.js';
import { ocrService } from '../../OcrService/index.js';

/** Read straight off the wire as UTF-8 — never reaches OCR, so no media type needed. */
export const TEXT_EXTENSIONS = ['.txt', '.md'];

/**
 * Binary document types handed to OCR. Every entry MUST have a mapping in
 * `getMediaType`; without one it goes out as application/octet-stream and Mistral
 * rejects the request, which the caller counts as an error per file on every full
 * crawl. `wolkeMediaTypes.vitest.ts` guards the pair.
 */
export const OCR_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.xlsx'];

/** Document types worth extracting from a share (skip images, archives, media). */
const SUPPORTED_EXTENSIONS = [...OCR_EXTENSIONS, ...TEXT_EXTENSIONS];

/** Guard against pathological share trees / recursion loops. */
const MAX_RECURSION_DEPTH = 5;

const WEBDAV_PREFIX = '/public.php/webdav';

export interface WolkeShareFile {
  /** Stable dedup key / source_url: `<shareLink>#<relative-path>`. */
  url: string;
  /** WebDAV href passed verbatim to NextcloudApiClient.downloadFile. */
  href: string;
  /** File name incl. extension. */
  name: string;
  /** WebDAV etag — changes iff the file content changes. */
  etag: string | null;
  /** WebDAV last-modified (folder mtime, NOT a publish date). */
  lastModified: Date | null;
}

/**
 * macOS writes an AppleDouble sidecar (`._Foo.pdf`) next to every real file it
 * copies onto a share. The name carries the document extension but the bytes are
 * a resource fork, so `.pdf` passes the extension filter, goes out as
 * `data:application/pdf`, and Mistral OCR rejects it on content sniffing
 * (`Document type 'application/octet-stream' is not supported`, code 3310).
 * Measured on LV SL's Wolke share: 3 such files, 3 hard errors on every nightly
 * full crawl. They are metadata, never content — drop them at discovery.
 */
export function isAppleDoubleSidecar(name: string): boolean {
  return name.startsWith('._');
}

function hasSupportedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The shared NextcloudApiClient's regex parser leaves the WebDAV etag
 * HTML-entity-escaped (`&quot;…&quot;`). Normalize to the bare token here so the
 * stored `wolke_etag` is clean and the dedup compare stays stable run-to-run.
 */
function normalizeEtag(etag: string | null): string | null {
  if (!etag) return null;
  return etag.replace(/&quot;/g, '').replace(/^["']|["']$/g, '');
}

/** WebDAV href → path relative to the share's webdav root (decoded, no leading slash). */
function hrefToRelativePath(href: string): string {
  const idx = href.indexOf(WEBDAV_PREFIX);
  const raw = idx >= 0 ? href.slice(idx + WEBDAV_PREFIX.length) : href;
  return decodeURIComponent(raw).replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Enumerate all supported files in a public Nextcloud share (optionally
 * recursing into subfolders). Returns the initialized client so the caller can
 * download without re-authenticating.
 */
export async function collectWolkeShareFiles(
  shareLink: string,
  recursive: boolean,
  log: (msg: string) => void = () => {}
): Promise<{ client: NextcloudApiClient; files: WolkeShareFile[] }> {
  const client = await NextcloudApiClient.create(shareLink);
  const files: WolkeShareFile[] = [];
  const seenDirs = new Set<string>();

  const walk = async (folderPath: string | undefined, depth: number): Promise<void> => {
    const entries = await client.listFolder(folderPath);
    for (const entry of entries as NextcloudFile[]) {
      const rel = hrefToRelativePath(entry.href);
      // PROPFIND Depth:1 echoes the folder itself — skip it to avoid recursing forever.
      if (rel === (folderPath ?? '')) continue;

      if (entry.isDirectory) {
        if (!recursive || depth >= MAX_RECURSION_DEPTH || seenDirs.has(rel)) continue;
        seenDirs.add(rel);
        await walk(rel, depth + 1);
        continue;
      }

      if (isAppleDoubleSidecar(entry.name) || !hasSupportedExtension(entry.name)) continue;
      files.push({
        url: `${shareLink}#/${rel}`,
        href: entry.href,
        name: entry.name,
        etag: normalizeEtag(entry.etag),
        lastModified: entry.lastModified,
      });
    }
  };

  await walk(undefined, 0);
  log(`[Wolke] ${shareLink}: ${files.length} supported file(s)`);
  return { client, files };
}

/** What one share file cost to read — see `extractionRecorder.ts`. */
export interface WolkeExtraction {
  text: string;
  /** Extractor label; 'plain-read' for txt/md, which costs nothing. */
  method: string;
  pages: number;
}

/**
 * Download a share file and extract its text (Mistral OCR for binary documents,
 * plain read for txt/md). Returns an empty `text` on empty extraction.
 *
 * The method and page count travel with the text because the caller reports
 * them: for a txt/md read there is nothing to bill, for an OCR'd scan there is
 * one line item per page.
 */
export async function extractWolkeFileText(
  client: NextcloudApiClient,
  file: WolkeShareFile
): Promise<WolkeExtraction> {
  const { buffer } = await client.downloadFile(file.href);
  const lower = file.name.toLowerCase();

  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { text: buffer.toString('utf-8'), method: 'plain-read', pages: 0 };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempPath = path.join(os.tmpdir(), `wolke_${Date.now()}_${safeName}`);
  try {
    await fs.writeFile(tempPath, buffer);
    const result = await ocrService.extractTextFromDocument(tempPath);
    return {
      text: result.text || '',
      method: result.extractionMethod || result.method || 'unknown',
      pages: result.pageCount ?? 0,
    };
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}
