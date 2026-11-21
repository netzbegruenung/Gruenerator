/**
 * Clarity client: request shape against the EU host and the mapping of
 * provider failures to codes. fetch is stubbed — no network, no money.
 *
 * Run: `npx vitest run services/voice/__tests__/enhanceService.vitest.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../config/env.js', () => ({ env: { KUGELAUDIO_API_KEY: 'k' } }));

const { enhanceSpeech } = await import('../enhanceService.js');

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('enhanceSpeech', () => {
  it('posts multipart with model clarity-1 to the EU host', async () => {
    fetchMock.mockResolvedValue(
      new Response(Buffer.from('RIFFxxxx'), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      })
    );
    const out = await enhanceSpeech(Buffer.from('RIFFin'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.eu.kugelaudio.com/v1/audio/enhance');
    expect(init.headers.Authorization).toBe('Bearer k');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('clarity-1');
    expect(form.get('task')).toBeNull();
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(out.subarray(0, 4).toString()).toBe('RIFF');
  });

  it.each([
    [402, 'FREE_PERIOD_ENDED', 'unavailable'],
    [402, 'INSUFFICIENT_CREDITS', 'unavailable'],
    [403, 'UNAUTHORIZED', 'unavailable'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [503, 'MODEL_UNAVAILABLE', 'unavailable'],
    [502, 'INTERNAL_ERROR', 'unavailable'],
    [400, 'VALIDATION_ERROR', 'invalid_input'],
  ])('maps %i %s to %s', async (status, error_code, code) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'x', error_code }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(enhanceSpeech(Buffer.from('RIFF'))).rejects.toMatchObject({ code, status });
  });
});
