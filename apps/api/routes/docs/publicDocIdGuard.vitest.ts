/**
 * The public doc doors take the id straight from the URL. A malformed id used
 * to reach Postgres, fail the uuid cast (22P02) and come back as a 500 — it
 * must be a 404 without a query (#5604).
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server } from 'http';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('@gruenerator/hocuspocus', () => ({ blockNoteXmlToHtml: vi.fn() }));

const { default: publicDocRouter } = await import('./publicDocController.js');
const { default: resolveRouter } = await import('./resolveController.js');

const VALID_ID = '3f2b8c1e-7a4d-4e2f-9b6a-1c0d5e8f2a7b';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use('/api/docs/public', publicDocRouter);
  app.use('/api/docs/resolve', resolveRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}/api/docs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe('public doc id guard', () => {
  it.each(['/public/does-not-exist', '/public/does-not-exist/og', '/resolve/does-not-exist'])(
    '%s answers 404 without querying',
    async (path) => {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(404);
      expect(query).not.toHaveBeenCalled();
    }
  );

  it.each(['/public/', '/resolve/'])('%s<uuid> still reaches the query', async (path) => {
    const res = await fetch(`${baseUrl}${path}${VALID_ID}`);
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.any(String), [VALID_ID, expect.any(Array)]);
  });
});
