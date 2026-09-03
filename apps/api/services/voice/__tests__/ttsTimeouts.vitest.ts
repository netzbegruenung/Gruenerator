/**
 * The deadlines around the KugelAudio request (#3207): a provider that accepts
 * the request and never answers, or that goes quiet mid-body, must fail the
 * call instead of holding the Express response open forever. Fake timers, a
 * fake fetch — no network, no money.
 *
 * Run: `npx vitest run services/voice/__tests__/ttsTimeouts.vitest.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../config/env.js', () => ({
  env: { KUGELAUDIO_API_KEY: 'test-key', KUGELAUDIO_DEFAULT_VOICE_ID: 1 },
}));

vi.mock('../../usage/UsageTrackingService.js', () => ({
  recordOperation: vi.fn(),
}));

const { default: ttsService } = await import('../ttsService.js');

const PCM = Buffer.alloc(4800);

/** A fetch that never answers but honours its abort signal, like a stalled socket. */
function stalled(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  });
}

function answered(): Promise<Response> {
  return Promise.resolve(new Response(PCM, { status: 200, headers: { 'x-sample-rate': '24000' } }));
}

/** A body that sends one chunk and then goes quiet forever. */
function halfBody(): Promise<Response> {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(PCM.subarray(0, 480)));
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

describe('KugelAudio deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries once when the provider never answers, then succeeds', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(stalled).mockImplementationOnce(answered);
    vi.stubGlobal('fetch', fetchMock);

    const pending = ttsService.generateSpeech('Hallo', { language: 'de' });
    await vi.advanceTimersByTimeAsync(30_000);
    const wav = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('fails after the second stall instead of waiting forever', async () => {
    const fetchMock = vi.fn().mockImplementation(stalled);
    vi.stubGlobal('fetch', fetchMock);

    const pending = ttsService.generateSpeech('Hallo', { language: 'de' });
    const outcome = pending.catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(outcome).resolves.toMatchObject({
      name: 'UpstreamTimeoutError',
      message: expect.stringContaining('30 s'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up on a body that goes quiet mid-stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(halfBody));

    const pending = ttsService.generateSpeech('Hallo', { language: 'de' });
    const outcome = pending.catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(outcome).resolves.toMatchObject({
      name: 'UpstreamTimeoutError',
      message: expect.stringContaining('keine Audiodaten'),
    });
  });

  it('does not retry when it was the client that hung up', async () => {
    const fetchMock = vi.fn().mockImplementation(stalled);
    vi.stubGlobal('fetch', fetchMock);
    const client = new AbortController();

    const pending = ttsService.generateSpeech('Hallo', { language: 'de', signal: client.signal });
    const outcome = pending.catch((error: Error) => error);
    client.abort();

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
