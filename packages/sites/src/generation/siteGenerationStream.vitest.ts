import { type SiteGenerationEvent, type WebsiteContent } from '@gruenerator/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notifyAiConsentRequired = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', () => ({
  getGlobalApiClient: () => ({ defaults: { baseURL: '/api' } }),
  stripApiPrefix: (p: string) => (p.startsWith('/api/') ? p.slice(4) : p),
  notifyAiConsentRequired,
}));

import { SitesApiError } from '../utils/errorHandler';

import { SiteGenerationError, streamSiteGeneration } from './siteGenerationStream';

const content: WebsiteContent = {
  hero: { heading: 'H', text: 'T' },
  about: { title: 'A', content: 'Über mich' },
  hero_image: { title: 'x', subtitle: 'y' },
  themes: [{ title: 'Klima', content: 'c' }],
  actions: [{ text: 'Mach mit', link: 'https://example.org' }],
  contact: { title: 'Kontakt', email: '' },
};

const frame = (data: unknown) =>
  `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

const fetchMock = vi.fn();
const description = 'x'.repeat(60);

function run(events: SiteGenerationEvent[] = []) {
  return streamSiteGeneration(
    { description },
    'a@b.de',
    (e) => events.push(e),
    new AbortController().signal
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  notifyAiConsentRequired.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('streamSiteGeneration', () => {
  it('posts multipart to the contracted path', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame({ type: 'done', content })]));
    await run();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sites/generate');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = init.body as FormData;
    expect(body.get('description')).toBe(description);
    expect(body.get('email')).toBe('a@b.de');
    expect(body.has('flyer')).toBe(false);

    fetchMock.mockResolvedValue(sseResponse([frame({ type: 'done', content })]));
    const file = new File(['%PDF-'], 'f.pdf', { type: 'application/pdf' });
    await streamSiteGeneration({ file }, '', () => undefined, new AbortController().signal);
    const flyerBody = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData;
    expect(flyerBody.get('flyer')).toBeInstanceOf(File);
    expect(flyerBody.has('description')).toBe(false);
    expect(flyerBody.has('email')).toBe(false);
  });

  it('resolves with the done content across split chunks', async () => {
    const done = frame({ type: 'done', content });
    const a = Math.floor(done.length / 3);
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ type: 'start', steps: ['extract', 'write'] }) +
          frame({ type: 'step', step: 'write' }),
        done.slice(0, a),
        done.slice(a, 2 * a),
        done.slice(2 * a),
      ])
    );
    const events: SiteGenerationEvent[] = [];
    await expect(run(events)).resolves.toEqual(content);
    expect(events.map((e) => e.type)).toEqual(['start', 'step', 'done']);
  });

  it('ignores heartbeats and malformed frames', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ type: 'heartbeat' }),
        frame('{not json'),
        frame({ type: 'unknown' }),
        frame({ type: 'done', content }),
      ])
    );
    const events: SiteGenerationEvent[] = [];
    await expect(run(events)).resolves.toEqual(content);
    expect(events.map((e) => e.type)).toEqual(['done']);
  });

  it('throws the server message on an error event', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([frame({ type: 'error', message: 'M', retryable: false })])
    );
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiteGenerationError);
    expect((err as SiteGenerationError).message).toBe('M');
    expect((err as SiteGenerationError).retryable).toBe(false);
  });

  it('throws when the stream ends without done', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame({ type: 'step', step: 'write' })]));
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiteGenerationError);
    expect((err as SiteGenerationError).message).toBe(
      'Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.'
    );
    expect((err as SiteGenerationError).retryable).toBe(true);
  });

  it('routes a consent 403 to the consent signal', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: 'ai_consent_required', error: 'E' }, { status: 403 })
    );
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SitesApiError);
    expect((err as SitesApiError).status).toBe(403);
    expect(notifyAiConsentRequired).toHaveBeenCalledTimes(1);
  });

  it('rejects other failures with the server message and no consent signal', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'Nur PDF-Dateien sind erlaubt.' }, { status: 400 })
    );
    const err = await run().catch((e: unknown) => e);
    expect((err as SitesApiError).message).toBe('Nur PDF-Dateien sind erlaubt.');
    expect(notifyAiConsentRequired).not.toHaveBeenCalled();
  });
});
