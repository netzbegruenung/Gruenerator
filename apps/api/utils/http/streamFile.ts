import { pipeline } from 'node:stream';

import { buildContentDisposition } from './contentDisposition.js';

import type { Request, Response } from 'express';
import type { Readable } from 'stream';

export interface StreamFileOptions {
  size: number;
  contentType: string;
  open: (range: { start: number; end: number } | null) => Readable;
  downloadName: string | null;
}

/** Byte-range streaming for video and audio — what `<video>`/`<audio>` need to seek. */
export function streamFile(req: Request, res: Response, opts: StreamFileOptions): void {
  const { size: fileSize, contentType, open, downloadName } = opts;
  const disposition: Record<string, string> = downloadName
    ? { 'Content-Disposition': buildContentDisposition(downloadName, 'attachment') }
    : {};
  const range = req.headers.range;

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
    });
    send(res, open({ start, end }));
    return;
  }

  res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType, ...disposition });
  send(res, open(null));
}

/** A read error must end the response, not crash the worker; a client abort frees the file. */
function send(res: Response, source: Readable): void {
  pipeline(source, res, () => undefined);
  res.on('close', () => source.destroy());
}
