/**
 * The video editor's captions: a clip the person picked locally only exists as
 * a blob in their browser, so it arrives as a file. It must be transcribed from
 * disk (an HTTP round trip to our own /api would hit requireAuth and the SSRF
 * guard) and never left behind in the temp directory.
 */
import fs from 'node:fs';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const transcribeWithProvider = vi.fn();
vi.mock('../../services/subtitler/transcriptionService.js', () => ({ transcribeWithProvider }));

const { default: transcribeController } = await import('./transcribeController.js');

let baseUrl = '';
let close: () => void = () => {};
let userLocale: string | null = null;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string; locale?: string } }).user = {
      id: 'u1',
      ...(userLocale ? { locale: userLocale } : {}),
    };
    next();
  });
  app.use('/api/video', transcribeController);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  transcribeWithProvider.mockReset();
  userLocale = null;
});

function postFile() {
  const form = new FormData();
  form.append('file', new Blob(['fake video'], { type: 'video/mp4' }), 'clip.mp4');
  return fetch(`${baseUrl}/api/video/transcribe/file`, { method: 'POST', body: form });
}

describe('POST /api/video/transcribe/file', () => {
  it('transcribes the uploaded file with word timestamps and removes it afterwards', async () => {
    let seenPath = '';
    transcribeWithProvider.mockImplementation(async (path: string) => {
      seenPath = path;
      expect(fs.existsSync(path)).toBe(true);
      return { text: 'Hallo Welt', words: [{ word: 'Hallo', start: 0, end: 0.4 }] };
    });

    const res = await postFile();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: { main: { words: [{ word: 'Hallo', start: 0, end: 0.4 }] } },
    });
    expect(transcribeWithProvider).toHaveBeenCalledWith(seenPath, true, null, 'de-DE');
    expect(fs.existsSync(seenPath)).toBe(false);
  });

  it("uses the person's locale, so Austrian speech gets the de-AT bias", async () => {
    userLocale = 'de-AT';
    transcribeWithProvider.mockResolvedValue({ text: '', words: [] });

    await postFile();

    expect(transcribeWithProvider.mock.calls[0][3]).toBe('de-AT');
  });

  it('answers 400 without a file', async () => {
    const res = await fetch(`${baseUrl}/api/video/transcribe/file`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect(transcribeWithProvider).not.toHaveBeenCalled();
  });

  it('removes the file when the provider fails', async () => {
    let seenPath = '';
    transcribeWithProvider.mockImplementation(async (path: string) => {
      seenPath = path;
      throw new Error('provider down');
    });

    const res = await postFile();

    expect(res.status).toBe(500);
    expect(fs.existsSync(seenPath)).toBe(false);
  });
});
