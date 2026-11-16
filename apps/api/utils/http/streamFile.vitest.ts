import { PassThrough, Readable } from 'stream';

import { describe, expect, it } from 'vitest';

import { streamFile } from './streamFile.js';

import type { Request, Response } from 'express';

const DATA = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

function run(range: string | null, downloadName: string | null = null) {
  const req = { headers: range ? { range } : {} } as unknown as Request;
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  const res = Object.assign(out, {
    status: 0,
    headers: {} as Record<string, string | number>,
    writeHead(status: number, headers: Record<string, string | number>) {
      this.status = status;
      this.headers = headers;
    },
  });
  streamFile(req, res as unknown as Response, {
    size: DATA.length,
    contentType: 'video/mp4',
    downloadName,
    open: (r) =>
      Readable.from([r ? DATA.subarray(r.start, r.end + 1) : DATA], { objectMode: false }),
  });
  return new Promise<{ status: number; headers: Record<string, string | number>; body: Buffer }>(
    (resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ status: res.status, headers: res.headers, body: Buffer.concat(chunks) });
      };
      out.on('end', finish);
      out.on('close', finish);
      out.on('finish', finish);
    }
  );
}

describe('streamFile', () => {
  it('bytes=0-9 → 206, Content-Range bytes 0-9/100', async () => {
    const r = await run('bytes=0-9');
    expect(r.status).toBe(206);
    expect(r.headers['Content-Range']).toBe('bytes 0-9/100');
    expect(r.body.length).toBe(10);
  });
  it('bytes=200- → 416', async () => {
    const r = await run('bytes=200-');
    expect(r.status).toBe(416);
    expect(r.headers['Content-Range']).toBe('bytes */100');
  });
  it('bytes=-10 → last 10 bytes', async () => {
    const r = await run('bytes=-10');
    expect(r.status).toBe(206);
    expect(r.headers['Content-Range']).toBe('bytes 90-99/100');
    expect([...r.body]).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
  });
  it('no range → 200 full body', async () => {
    const r = await run(null);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(100);
    expect(r.headers['Content-Disposition']).toBeUndefined();
  });
  it('downloadName "Müllerstein.mp4" → filename*=UTF-8\'\'M%C3%BCllerstein.mp4', async () => {
    const r = await run(null, 'Müllerstein.mp4');
    expect(r.headers['Content-Disposition']).toContain("filename*=UTF-8''M%C3%BCllerstein.mp4");
    expect(r.headers['Content-Disposition']).toContain('attachment; filename="M_llerstein.mp4"');
  });

  it('a read error ends the response without throwing', async () => {
    const req = { headers: {} } as unknown as Request;
    const out = new PassThrough();
    const res = Object.assign(out, { writeHead: () => undefined });
    const source = new Readable({
      read() {
        this.destroy(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      },
    });
    const ended = new Promise<void>((resolve) => out.on('close', () => resolve()));
    expect(() =>
      streamFile(req, res as unknown as Response, {
        size: 10,
        contentType: 'video/mp4',
        downloadName: null,
        open: () => source,
      })
    ).not.toThrow();
    await ended;
    expect(out.destroyed).toBe(true);
  });

  it('a client close destroys the source stream', async () => {
    const req = { headers: {} } as unknown as Request;
    const out = new PassThrough();
    const res = Object.assign(out, { writeHead: () => undefined });
    const source = new PassThrough();
    streamFile(req, res as unknown as Response, {
      size: 10,
      contentType: 'video/mp4',
      downloadName: null,
      open: () => source,
    });
    out.destroy();
    await new Promise((r) => setImmediate(r));
    expect(source.destroyed).toBe(true);
  });
});
