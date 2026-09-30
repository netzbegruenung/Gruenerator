/**
 * The "no file" branch of the document upload: a request that is not
 * multipart at all is a client bug (the web client once serialized its
 * FormData to JSON) and must reach GlitchTip, while a real multipart request
 * without a file is a plain 400. A handled 400 never passes the Express
 * error handler, so the router reports it itself.
 */
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
const captureMessage = vi.fn();
vi.mock('../../lib/sentry.js', () => ({
  Sentry: {
    captureMessage: (...a: unknown[]) => captureMessage(...a),
    withScope: (fn: (scope: { setLevel: () => void; setTag: () => void }) => void) =>
      fn({ setLevel: vi.fn(), setTag: vi.fn() }),
  },
}));
vi.mock('../../services/translation/documentJobs.js', () => ({
  startDocumentJob: vi.fn(),
  documentJobFile: vi.fn(),
}));

const { translationUploadRouter } = await import('./translationUploadRouter.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use(express.json());
  app.use('/api/translation', translationUploadRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => captureMessage.mockClear());

describe('POST /api/translation/document without a file', () => {
  it('reports a JSON body to GlitchTip and still answers 400', async () => {
    const res = await fetch(`${baseUrl}/api/translation/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: {}, targetLang: 'en-GB' }),
    });

    expect(res.status).toBe(400);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('does not report a multipart body that simply lacks the file', async () => {
    const form = new FormData();
    form.append('targetLang', 'en-GB');
    const res = await fetch(`${baseUrl}/api/translation/document`, { method: 'POST', body: form });

    expect(res.status).toBe(400);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
