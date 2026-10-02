/**
 * `shouldCompress` — warum SSE nicht durch `compression` darf.
 *
 * `compression` 1.8 bevorzugt Brotli, sobald der Client `br` anbietet, und
 * `text/event-stream` gilt als komprimierbar. Browser dekodieren Brotli
 * inkrementell; Androids `expo/fetch` dekodiert es mit dem Java-Decoder
 * `org.brotli.dec`, der erst zurückkehrt, wenn sein Ausgabepuffer (8 KB) voll
 * oder der Stream zu Ende ist. Die App sah deshalb jeden Chat-Turn erst
 * komplett am Ende — Statuszeile, Tool-Karten und Reasoning kamen nie live an.
 *
 * Der Test fährt genau die Verhandlung, die den Fehler erzeugt hat: den
 * `Accept-Encoding`-Header von Androids Interceptor gegen eine SSE- und eine
 * JSON-Route. Anfragen per `node:http`, nicht `fetch` — undici dekodiert still
 * und nimmt `content-encoding` aus den Headern.
 */

import compression from 'compression';
import express from 'express';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { shouldCompress } from './compressionFilter.js';

const ANDROID_ACCEPT_ENCODING = 'zstd, br, gzip';
const PAYLOAD = 'x'.repeat(4096);

let server: http.Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use(compression({ filter: shouldCompress }));
  app.get('/sse', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    for (let i = 0; i < 4; i++) res.write(`event: text_delta\ndata: ${PAYLOAD}\n\n`);
    res.end();
  });
  app.get('/json', (_req, res) => {
    res.json({ text: PAYLOAD });
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function get(path: string, headers: Record<string, string>): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers }, (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      })
      .on('error', reject);
  });
}

describe('shouldCompress', () => {
  it('leaves text/event-stream uncompressed even when the client offers br', async () => {
    const res = await get('/sse', { 'accept-encoding': ANDROID_ACCEPT_ENCODING });
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('still compresses ordinary responses, preferring brotli', async () => {
    const res = await get('/json', { 'accept-encoding': ANDROID_ACCEPT_ENCODING });
    expect(res.headers['content-encoding']).toBe('br');
  });

  it('honours x-no-compression', async () => {
    const res = await get('/json', {
      'accept-encoding': ANDROID_ACCEPT_ENCODING,
      'x-no-compression': '1',
    });
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
