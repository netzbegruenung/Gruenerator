/**
 * Tests for searxngNode after the removal of the Mistral web-search fallback.
 *
 * The fallback used to hide SearXNG outages behind a second provider. Without
 * it, an outage must be visible: the node marks the run as a critical failure
 * so callers can say "search is down" instead of "nothing found".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPerformWebSearch = vi.fn();

vi.mock('../../../../services/search/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/search/index.js')>(
    '../../../../services/search/index.js'
  );
  return {
    ...actual,
    searxngService: { performWebSearch: (...args: unknown[]) => mockPerformWebSearch(...args) },
  };
});

const { searxngNode } = await import('./SearxngNode.js');
const { searxngCircuit } = await import('../../../../services/search/searchRetryStrategy.js');

function state(subqueries: string[]) {
  return {
    query: subqueries[0],
    mode: 'normal' as const,
    subqueries,
    searchOptions: {},
    metadata: {},
  } as never;
}

describe('searxngNode', () => {
  beforeEach(() => {
    mockPerformWebSearch.mockReset();
    searxngCircuit.reset();
  });

  it('returns SearXNG results without a fallback provider', async () => {
    mockPerformWebSearch.mockResolvedValue({
      results: [{ url: 'https://example.org', title: 'T', content: 'c', snippet: 's' }],
    });

    const out = await searxngNode(state(['klimaschutz']));

    expect(out.webResults).toHaveLength(1);
    expect(out.webResults?.[0]?.provider).toBe('searxng');
    expect(out.error).toBeUndefined();
    expect(out.metadata?.criticalFailure).toBeUndefined();
  });

  it('flags a critical failure when every query fails', async () => {
    mockPerformWebSearch.mockRejectedValue(new Error('ECONNREFUSED'));

    const out = await searxngNode(state(['a', 'b']));

    expect(out.webResults?.every((r) => !r.success)).toBe(true);
    expect(out.error).toBeTruthy();
    expect(out.metadata?.criticalFailure).toBe(true);
  });

  it('short-circuits remaining queries once the circuit opens', async () => {
    mockPerformWebSearch.mockRejectedValue(new Error('timeout'));

    await searxngNode(state(['a', 'b', 'c']));
    const callsAfterFirstRun = mockPerformWebSearch.mock.calls.length;

    // Two failing queries (1 retry each) open the circuit; the third must not
    // reach the network at all.
    expect(callsAfterFirstRun).toBe(4);

    mockPerformWebSearch.mockClear();
    const out = await searxngNode(state(['d']));
    expect(mockPerformWebSearch).not.toHaveBeenCalled();
    expect(out.metadata?.criticalFailure).toBe(true);
  });

  it('keeps partial success when only some queries fail', async () => {
    mockPerformWebSearch
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ results: [{ url: 'u', title: 't', content: 'c', snippet: 's' }] });

    const out = await searxngNode(state(['a', 'b']));

    expect(out.metadata?.successfulWebSearches).toBe(1);
    expect(out.error).toBeUndefined();
  });
});
