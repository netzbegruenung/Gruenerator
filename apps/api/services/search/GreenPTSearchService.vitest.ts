/**
 * GreenPT's search endpoint signals throttling by answering HTTP 200 with an
 * empty `results` array — there is no error, no 429 and no header movement.
 * Everything here exists to pin the one decision that makes that survivable:
 * an empty result set is a FAILURE, not an answer. If these tests are ever
 * "fixed" by returning `[]` instead of throwing, the chat starts answering
 * ungrounded and nothing in the logs will say why.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { GREENPT_API_KEY: 'test-key', LOG_LEVEL: 'warn' },
}));
vi.mock('../usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));

const {
  GreenPTSearchService,
  GreenPTEmptyError,
  getGreenPTSearchService,
  GREENPT_MAX_RESULTS,
  _resetGreenPTSearchServiceForTests,
} = await import('./GreenPTSearchService.js');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const hit = (n: number) => ({
  url: `https://example.de/${n}`,
  title: `Titel ${n}`,
  description: `Ein Auszug mit Inhalt ${n}`,
  position: n,
});
const ok = (results: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results }),
  text: async () => '',
});

beforeEach(() => {
  fetchMock.mockReset();
  _resetGreenPTSearchServiceForTests();
});

describe('GreenPTSearchService — empty means throttled, not "nothing found"', () => {
  it('throws GreenPTEmptyError on an empty result array', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'Einwohnerzahl Kassel' })).rejects.toBeInstanceOf(
      GreenPTEmptyError
    );
  });

  it('throws when every hit is unusable — a result without a description would become an empty numbered source', async () => {
    fetchMock.mockResolvedValue(ok([{ url: 'https://example.de/1', title: 'T', description: '' }]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'Einwohnerzahl Kassel' })).rejects.toBeInstanceOf(
      GreenPTEmptyError
    );
  });

  it('drops unusable hits but keeps the usable ones', async () => {
    fetchMock.mockResolvedValue(
      ok([hit(1), { url: '', title: 'kein Link', description: 'x' }, hit(2)])
    );
    const svc = new GreenPTSearchService('k');
    const res = await svc.webSearch({ query: 'Einwohnerzahl Kassel' });
    expect(res.map((r) => r.url)).toEqual(['https://example.de/1', 'https://example.de/2']);
  });

  it('returns the hits on a healthy response', async () => {
    fetchMock.mockResolvedValue(ok([hit(1), hit(2), hit(3)]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'Einwohnerzahl Kassel' })).resolves.toHaveLength(3);
  });
});

describe('GreenPTSearchService — request shape', () => {
  it("clamps maxResults to the endpoint's real ceiling, whatever the docs advertise", async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    await new GreenPTSearchService('k').webSearch({ query: 'q', maxResults: 50 });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      maxResults: number;
    };
    expect(body.maxResults).toBe(GREENPT_MAX_RESULTS);
  });

  it('sends the region as a lower-case country code — a locale like de-DE is silently ignored upstream', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    await new GreenPTSearchService('k').webSearch({ query: 'q', country: 'at' });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      country?: string;
    };
    expect(body.country).toBe('at');
  });

  it('treats a non-2xx as a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    await expect(new GreenPTSearchService('k').webSearch({ query: 'q' })).rejects.toThrow(/502/);
  });
});

describe('GreenPTSearchService — circuit breaker', () => {
  it('opens after two consecutive empty responses, so a throttled window is not re-paid per search', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'a' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    await expect(svc.webSearch({ query: 'b' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    await expect(svc.webSearch({ query: 'c' })).rejects.toThrow(/circuit open/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a single empty response counts once — two failures must mean two calls', async () => {
    fetchMock.mockResolvedValueOnce(ok([])).mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'a' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    await expect(svc.webSearch({ query: 'b' })).resolves.toHaveLength(1);
  });
});

describe('getGreenPTSearchService — gated on the key alone', () => {
  it('returns a service when the key is set; the chain decides whether searches reach it', () => {
    expect(getGreenPTSearchService()).not.toBeNull();
  });
});
