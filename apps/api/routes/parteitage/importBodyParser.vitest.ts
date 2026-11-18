import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConditionalBodyParser } from '../../middleware/bodyParserConfig.js';
import { jsonBody } from '../../middleware/jsonBody.js';

const m = vi.hoisted(() => ({ requireInstanceAdmin: vi.fn() }));
vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin: m.requireInstanceAdmin }));

const { PARTEITAGE_IMPORT_PATH, parteitageImportBodyParser } =
  await import('./importBodyParser.js');

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** Mirrors server.ts (global parser with skip list) and routes.ts (route-specific parser). */
async function start(): Promise<string> {
  const app = express();
  app.use(createConditionalBodyParser(jsonBody('50mb')));
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'u1' };
    next();
  });
  app.post(PARTEITAGE_IMPORT_PATH, ...parteitageImportBodyParser, (req, res) => {
    res.json({ values: (req.body as { a: number[] }).a.length });
  });
  app.post('/api/other', (req, res) => res.json({ ok: true, body: req.body ? 1 : 0 }));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const bigBody = JSON.stringify({ a: Array.from({ length: 150_000 }, (_, i) => i) });
const post = (url: string, body: string) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('parteitage import body parser', () => {
  it('lets an admin post a body with more than 100k JSON values', async () => {
    m.requireInstanceAdmin.mockResolvedValue(true);
    const base = await start();
    const res = await post(base + PARTEITAGE_IMPORT_PATH, bigBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ values: 150_000 });
  });

  it('answers 403 to a non-admin before any body is parsed', async () => {
    m.requireInstanceAdmin.mockResolvedValue(false);
    const base = await start();
    const res = await post(base + PARTEITAGE_IMPORT_PATH, bigBody);
    expect(res.status).toBe(403);
  });

  it('keeps the global value cap on every other route', async () => {
    const base = await start();
    const res = await post(base + '/api/other', bigBody);
    expect(res.status).toBe(413);
  });
});
