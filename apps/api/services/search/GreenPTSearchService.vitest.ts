/**
 * GreenPT's search endpoint signals throttling by answering HTTP 200 with an
 * empty `results` array — there is no error, no 429 and no header movement.
 * Everything here exists to pin the one decision that makes that survivable:
 * an empty result set is a FAILURE, not an answer. If these tests are ever
 * "fixed" by returning `[]` instead of throwing, the chat starts answering
 * ungrounded and nothing in the logs will say why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { GREENPT_SEARCH_ENABLED: true, GREENPT_API_KEY: 'test-key', LOG_LEVEL: 'warn' },
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
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Move past the per-process spacing gate so a test can make another call. */
function passRateGate() {
  vi.advanceTimersByTime(6_000);
}

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
  it("clamps maxResults to the endpoint's real ceiling of 10, whatever the docs advertise", async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    await new GreenPTSearchService('k').webSearch({ query: 'q', maxResults: 50 });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      maxResults: number;
    };
    expect(body.maxResults).toBe(GREENPT_MAX_RESULTS);
  });

  it('sends the language bias as `country`, the name the API actually uses', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    await new GreenPTSearchService('k').webSearch({ query: 'q', language: 'de-DE' });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      country?: string;
    };
    expect(body.country).toBe('de-DE');
  });

  it('treats a non-2xx as a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    await expect(new GreenPTSearchService('k').webSearch({ query: 'q' })).rejects.toThrow(/502/);
  });
});

describe('GreenPTSearchService — rate gate refuses rather than queues', () => {
  it('refuses a second call inside the 5s window instead of delaying the user', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });
    // Sustained calls above ~1/5s make the provider answer empty; the caller has
    // Linkup ready, so refusing immediately beats waiting.
    await expect(svc.webSearch({ query: 'zweite' })).rejects.toThrow(/rate gate/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows the next call once the window has passed', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });
    passRateGate();
    await expect(svc.webSearch({ query: 'zweite' })).resolves.toHaveLength(1);
  });
});

/**
 * The second mode, for the deep research agent: there, refusing saves nobody's
 * time — it only routes a minutes-long run's whole fan-out to the paid engine.
 * So `wait` queues for the same 5 s window instead of declining.
 */
describe('GreenPTSearchService — the wait mode the deep agent uses', () => {
  it('queues behind the window instead of refusing', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });

    const pending = svc.webSearch({ query: 'zweite', gate: 'wait' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serialises several waiters, so they do not all wake into the same burst', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });

    const a = svc.webSearch({ query: 'a', gate: 'wait' });
    const b = svc.webSearch({ query: 'b', gate: 'wait' });

    await vi.advanceTimersByTimeAsync(5_000);
    await a;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    await b;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up the wait when the run is aborted, rather than outliving it', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });
    const controller = new AbortController();

    const pending = svc.webSearch({ query: 'zweite', gate: 'wait', signal: controller.signal });
    const settled = expect(pending).rejects.toThrow(/aborted/i);
    controller.abort();

    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the chat default untouched — no mode means refuse', async () => {
    fetchMock.mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await svc.webSearch({ query: 'erste' });

    await expect(svc.webSearch({ query: 'zweite' })).rejects.toThrow(/rate gate/i);
  });
});

describe('GreenPTSearchService — circuit breaker', () => {
  it('opens after two consecutive empty responses, so a throttled window is not re-paid per search', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'a' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    passRateGate();
    await expect(svc.webSearch({ query: 'b' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    passRateGate();
    await expect(svc.webSearch({ query: 'c' })).rejects.toThrow(/circuit open/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a single empty response counts once — two failures must mean two calls', async () => {
    fetchMock.mockResolvedValueOnce(ok([])).mockResolvedValue(ok([hit(1)]));
    const svc = new GreenPTSearchService('k');
    await expect(svc.webSearch({ query: 'a' })).rejects.toBeInstanceOf(GreenPTEmptyError);
    passRateGate();
    await expect(svc.webSearch({ query: 'b' })).resolves.toHaveLength(1);
  });
});

describe('getGreenPTSearchService — gated on the explicit flag', () => {
  it('returns a service when the flag is on and the key is set', () => {
    expect(getGreenPTSearchService()).not.toBeNull();
  });
});
