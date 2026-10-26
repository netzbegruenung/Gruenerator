/**
 * `jsonBody` caps the number of values in a JSON body before it is parsed, so
 * neither `JSON.parse` nor zod's per-element issues can be driven by a body
 * full of tiny values (GHSA-mrhx-c7xc-m3w5).
 */

import express from 'express';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MAX_JSON_VALUES, countJsonValues, jsonBody } from './jsonBody.js';

const count = (text: string) => countJsonValues(Buffer.from(text), Number.POSITIVE_INFINITY);

describe('countJsonValues', () => {
  it('counts commas and opened containers', () => {
    expect(count('[1,2,3]')).toBe(3);
    expect(count('{"a":1,"b":[1,2]}')).toBe(4);
    expect(count('{}')).toBe(1);
  });

  it('ignores commas and brackets inside strings, escaped quotes included', () => {
    expect(count('{"a":"x,[{y","b":"say \\"hi, [there]\\" ,"}')).toBe(2);
    expect(count('["ä,ö","€,{"]')).toBe(2);
  });

  it('stops once the limit is passed', () => {
    expect(countJsonValues(Buffer.from('[' + '1,'.repeat(1000) + '1]'), 10)).toBe(11);
  });
});

describe('jsonBody', () => {
  let server: http.Server;
  let base: string;
  let parsed = 0;

  beforeAll(async () => {
    const app = express();
    app.use(jsonBody('50mb'));
    app.post('/tags', (req, res) => {
      parsed++;
      const result = z.object({ tags: z.array(z.string()) }).safeParse(req.body);
      res.status(result.success ? 200 : 400).json({ ok: result.success });
    });
    app.post('/echo', (req, res) => {
      res.json({ length: JSON.stringify(req.body).length });
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

  it('rejects a body with more values than the cap with 413, before any handler runs', async () => {
    const before = parsed;
    const body = JSON.stringify({ tags: new Array(MAX_JSON_VALUES + 1).fill(1) });
    const res = await post('/tags', body);
    expect(res.status).toBe(413);
    expect(parsed).toBe(before);
  });

  // A UTF-16 body would be decoded for JSON.parse while the scan reads its raw
  // bytes: an escaped quote desyncs the string tracking and the count drops.
  it('rejects charsets other than UTF-8 instead of counting their raw bytes', async () => {
    const before = parsed;
    const text = JSON.stringify({ note: '"', tags: new Array(MAX_JSON_VALUES + 1).fill(1) });
    const res = await fetch(`${base}/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-16le' },
      body: Buffer.from(text, 'utf16le'),
    });
    expect(res.status).toBe(415);
    expect(parsed).toBe(before);
  });

  it('passes a body below the cap on to validation', async () => {
    const res = await post('/tags', JSON.stringify({ tags: new Array(1000).fill('a') }));
    expect(res.status).toBe(200);
  });

  it('counts a large base64 string as a single value', async () => {
    const image = `data:image/png;base64,${'A'.repeat(10_000_000)}`;
    const res = await post('/echo', JSON.stringify({ image }));
    expect(res.status).toBe(200);
  });
});
