/**
 * The reason reranking moved to GreenPT is the `impact` object, and that object
 * is UNDOCUMENTED — docs.greenpt.ai/rerank lists only `usage.total_tokens` and
 * `inferenceTiming`. It was verified on the live endpoint on 2026-08-28, but a
 * field nobody promised can disappear in any deploy.
 *
 * So these tests pin both halves of that bet: that the measurement is recorded
 * when it arrives, and that reranking keeps working exactly as before when it
 * does not. If the second one ever fails, an undocumented field has become
 * load-bearing for search quality, which was never the deal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { GREENPT_API_KEY: 'test-key', GREENPT_RERANK_ENABLED: true, LOG_LEVEL: 'warn' },
}));

const recordImpact = vi.fn();
vi.mock('../usage/UsageTrackingService.js', () => ({ recordImpact }));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { greenptRerankService, GreenPTRerankError } = await import('./GreenPTRerankService.js');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const IMPACT = {
  version: '20250922',
  inferenceTime: { total: 53, unit: 'ms' },
  energy: { total: 4126, unit: 'Wms' },
  emissions: { total: 64, unit: 'ugCO2e' },
};

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => '',
});

const REQUEST = { query: 'Windkraft', documents: ['doc a', 'doc b', 'doc c'], topN: 3 };

beforeEach(() => {
  fetchMock.mockReset();
  recordImpact.mockReset();
  greenptRerankService.resetBreakerForTests();
});

describe('GreenPTRerankService', () => {
  it('records the measured footprint against the greenpt provider', async () => {
    fetchMock.mockResolvedValue(
      ok({ results: [{ index: 2, relevance_score: 0.81 }], impact: IMPACT })
    );

    await greenptRerankService.rerank(REQUEST);

    expect(recordImpact).toHaveBeenCalledWith({
      provider: 'greenpt',
      model: 'green-rerank',
      energyWms: 4126,
      emissionsUg: 64,
    });
  });

  it('still ranks when the undocumented impact field is absent', async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ index: 1, relevance_score: 0.42 }] }));

    const results = await greenptRerankService.rerank(REQUEST);

    expect(recordImpact).not.toHaveBeenCalled();
    expect(results).toEqual([{ originalIndex: 1, relevanceScore: 0.42, text: 'doc b' }]);
  });

  it('sends the same <Instruct>/<Document> wrapping Regolo gets', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }));

    await greenptRerankService.rerank({ ...REQUEST, instruct: 'Find the answer.' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('green-rerank');
    expect(body.query).toBe('<Instruct>: Find the answer.\n<Query>: Windkraft');
    expect(body.documents).toEqual(['<Document>: doc a', '<Document>: doc b', '<Document>: doc c']);
  });

  it('marks a timeout as timedOut so the pipeline does not stack a Regolo call behind it', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);

    await expect(greenptRerankService.rerank(REQUEST)).rejects.toMatchObject({
      name: 'GreenPTRerankError',
      timedOut: true,
    });
  });

  it('marks a 429 as a fast failure — Regolo is worth trying, the latency budget is intact', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too many requests, please try again later.',
    });

    const error = await greenptRerankService.rerank(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GreenPTRerankError);
    expect((error as InstanceType<typeof GreenPTRerankError>).timedOut).toBe(false);
  });

  it('opens the circuit after two 429s so rerank volume stops eating the shared account budget', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => '' });

    expect(greenptRerankService.isAvailable()).toBe(true);
    await greenptRerankService.rerank(REQUEST).catch(() => {});
    await greenptRerankService.rerank(REQUEST).catch(() => {});

    expect(greenptRerankService.isAvailable()).toBe(false);
  });

  it('opens the circuit after two timeouts — the one failure Regolo cannot pick up', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);

    await greenptRerankService.rerank(REQUEST).catch(() => {});
    await greenptRerankService.rerank(REQUEST).catch(() => {});

    // A timeout is not retried on Regolo (see rerankPipeline), so every
    // uncounted one costs 4s AND the ranking. Opening the circuit is what makes
    // the next call skip straight to Regolo and keep its ranking.
    expect(greenptRerankService.isAvailable()).toBe(false);
  });

  it('opens the circuit after two network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await greenptRerankService.rerank(REQUEST).catch(() => {});
    await greenptRerankService.rerank(REQUEST).catch(() => {});

    expect(greenptRerankService.isAvailable()).toBe(false);
  });

  it('leaves the circuit closed on a 4xx that is our own bug, so it stays loud', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });

    await greenptRerankService.rerank(REQUEST).catch(() => {});
    await greenptRerankService.rerank(REQUEST).catch(() => {});

    expect(greenptRerankService.isAvailable()).toBe(true);
  });
});
