import { pipeline } from 'node:stream';

import { buildContentDisposition } from './contentDisposition.js';

import type { Request, Response } from 'express';
import type { Readable } from 'stream';

export interface StreamFileOptions {
  size: number;
  contentType: string;
  open: (range: { start: number; end: number } | null) => Readable;
  downloadName: string | null;
  /**
   * When the file changed last. With it the response carries an ETag and
   * `Cache-Control: private, no-cache`: the browser keeps the bytes but asks
   * every time, so the caller's access checks still run and an unchanged file
   * costs a 304 instead of a full download. Without it nothing is cacheable,
   * as before.
   */
  lastModified?: Date;
}

/** Byte-range streaming for video and audio — what `<video>`/`<audio>` need to seek. */
export function streamFile(req: Request, res: Response, opts: StreamFileOptions): void {
  const { size: fileSize, contentType, open, downloadName, lastModified } = opts;
  const disposition: Record<string, string> = downloadName
    ? { 'Content-Disposition': buildContentDisposition(downloadName, 'attachment') }
    : {};
  const etag = lastModified
    ? `"${fileSize.toString(36)}-${lastModified.getTime().toString(36)}"`
    : null;
  const validators: Record<string, string> = etag
    ? {
        ETag: etag,
        'Last-Modified': (lastModified as Date).toUTCString(),
        'Cache-Control': 'private, no-cache',
      }
    : {};

  if (etag && req.headers['if-none-match'] === etag) {
    res.writeHead(304, validators);
    res.end();
    return;
  }

  // A range is only valid against the version the client already holds;
  // after a change, If-Range makes it a full response (RFC 9110 §13.1.5).
  const ifRange = req.headers['if-range'];
  const range = ifRange && ifRange !== etag ? undefined : req.headers.range;

  if (range) {
    // `bytes=a-b`, `bytes=a-` and the suffix form `bytes=-n` (RFC 7233), which
    // some players send for the trailer. Anything else, or a start past the
    // file, is a 416 — before this the NaN reached `createReadStream` after
    // the 206 header was already out.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const suffix = match && match[1] === '' ? Number(match[2]) : null;
    const start = match
      ? suffix !== null
        ? Math.max(0, fileSize - suffix)
        : Number(match[1])
      : NaN;
    const end =
      match && match[2] !== '' && suffix === null
        ? Math.min(Number(match[2]), fileSize - 1)
        : fileSize - 1;

    if (
      !match ||
      !Number.isFinite(start) ||
      (suffix !== null && !suffix) ||
      start >= fileSize ||
      start > end
    ) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
      ...disposition,
      ...validators,
    });
    send(res, open({ start, end }));
    return;
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    ...disposition,
    ...validators,
  });
  send(res, open(null));
}

/** A read error must end the response, not crash the worker; a client abort frees the file. */
function send(res: Response, source: Readable): void {
  pipeline(source, res, () => undefined);
  res.on('close', () => source.destroy());
}
