/**
 * "Ton verbessern" endpoint: the enhanced video lands in the Mediathek, every
 * provider failure maps to a calm German message, and the upload is never left
 * behind in the temp directory.
 *
 * Run: `npx vitest run routes/video/enhanceController.vitest.ts`
 */
import fs from 'node:fs';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const incrementRateLimit = vi.fn();
vi.mock('../../middleware/rateLimitMiddleware.js', () => ({
  rateLimitMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  incrementRateLimit: (...args: unknown[]) => incrementRateLimit(...args),
}));

const uploadMediaFile = vi.fn();
vi.mock('../../services/sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ uploadMediaFile }),
}));

const enhanceVideoAudio = vi.fn();
vi.mock('../../services/subtitler/audioEnhance.js', () => ({ enhanceVideoAudio }));

const { AudioEnhanceError } = await import('../../services/voice/enhanceService.js');
const { default: enhanceController } = await import('./enhanceController.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use('/api/video', enhanceController);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  enhanceVideoAudio.mockReset();
  uploadMediaFile.mockReset();
});

function postFile(fields: Record<string, string> = {}, withFile = true) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (withFile) form.append('file', new Blob(['fake video'], { type: 'video/mp4' }), 'clip.mp4');
  return fetch(`${baseUrl}/api/video/enhance/file`, { method: 'POST', body: form });
}

describe('POST /api/video/enhance/file', () => {
  it('stores the enhanced video in the mediathek', async () => {
    enhanceVideoAudio.mockImplementation(async (_in: string, out: string) => {
      await fs.promises.writeFile(out, 'enhanced');
      return { durationSeconds: 2 };
    });
    uploadMediaFile.mockResolvedValue({ id: 'm1', shareToken: 't1' });

    const res = await postFile({ title: 'Rede' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'm1', shareToken: 't1', mediaType: 'video' });
    expect(uploadMediaFile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        uploadSource: 'audio-enhance',
        mimeType: 'video/mp4',
        title: 'Rede (Ton verbessert)',
      })
    );
    // The enhanced file is handed over by path, not buffered.
    expect(uploadMediaFile.mock.calls[0][1].filePath).toBe(enhanceVideoAudio.mock.calls[0][1]);
    expect(incrementRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      enhanceVideoAudio.mock.invocationCallOrder[0]
    );
  });

  it.each([
    ['too_long', 400, 'Ton verbessern geht bei Videos bis 5 Minuten.'],
    ['no_audio', 400, 'Das Video hat keine Tonspur.'],
    ['invalid_input', 400, 'Dieses Video kann nicht verbessert werden.'],
    ['rate_limited', 429, 'Gerade wird zu viel Ton verbessert. Versuch es gleich noch einmal.'],
    ['unavailable', 503, 'Ton verbessern ist gerade nicht verfügbar.'],
  ] as const)('maps %s to %i', async (code, status, error) => {
    enhanceVideoAudio.mockRejectedValue(new AudioEnhanceError(code, null, 'x'));
    const res = await postFile();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(uploadMediaFile).not.toHaveBeenCalled();
  });

  it('answers 400 without a file', async () => {
    const res = await postFile({}, false);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Kein Video übergeben.' });
    expect(enhanceVideoAudio).not.toHaveBeenCalled();
  });

  it('deletes the upload temp file on failure', async () => {
    let seenPath = '';
    enhanceVideoAudio.mockImplementation(async (inPath: string) => {
      seenPath = inPath;
      expect(fs.existsSync(inPath)).toBe(true);
      throw new Error('boom');
    });
    const res = await postFile();
    expect(res.status).toBe(503);
    expect(seenPath).not.toBe('');
    expect(fs.existsSync(seenPath)).toBe(false);
  });
});
