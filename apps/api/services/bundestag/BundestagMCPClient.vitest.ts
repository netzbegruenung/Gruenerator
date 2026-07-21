/**
 * Unit tests for the BundestagMCPClient chat wrappers.
 *
 * The wrappers' whole job is context safety: trim MCP results into compact
 * DTOs before they reach the LLM. These tests pin the invariants:
 *
 *   1. Speech full text (3–4k chars from the server) is truncated to a
 *      600-char excerpt at the client boundary; string scores parse to numbers.
 *   2. Semantic abstracts are HTML-entity-decoded, tag-stripped and capped.
 *   3. The current Wahlperiode (21) is the default filter; zero results
 *      trigger exactly one period-free retry (flagged via `wpFallback`).
 *   4. DTOs never carry raw DIP keys (`fundstelle`, `text`, …).
 *   5. Wrappers never throw — network/JSON-RPC errors degrade to empty lists.
 *
 * fetch, env, the Redis cache and the logger are all mocked (hermetic).
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

// ── Module mocks (hoisted above imports by vitest) ──────────────────────────
vi.mock('../../config/env.js', () => ({
  env: { BUNDESTAG_MCP_URL: 'https://bundestag-mcp.test' },
}));

vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async () => null), // always a cache miss → produce runs
  setCachedJson: vi.fn(async () => undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { setCachedJson } from '../../utils/redis/jsonCache.js';

import { BundestagMCPClient, CURRENT_WAHLPERIODE } from './BundestagMCPClient.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

/** Wrap a tool payload in the MCP JSON-RPC envelope the server returns. */
const mcpResponse = (payload: unknown) => ({
  ok: true,
  json: async () => ({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  }),
});

/** Arguments of the n-th fetch call's tools/call request. */
const sentArgs = (call = 0): Record<string, unknown> => {
  const body = JSON.parse((fetchMock.mock.calls[call]?.[1] as { body: string }).body) as {
    params: { name: string; arguments: Record<string, unknown> };
  };
  return body.params.arguments;
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(setCachedJson).mockClear();
});

describe('BundestagMCPClient — speech trimming', () => {
  it('truncates full speech text to a 600-char excerpt and parses string scores', async () => {
    const fullSpeech = 'Sehr geehrte Damen und Herren, '.repeat(150); // ~4.6k chars
    fetchMock.mockResolvedValueOnce(
      mcpResponse({
        results: [
          {
            score: '1.670',
            speaker: 'Katharina Dröge',
            speakerParty: 'BÜNDNIS 90/DIE GRÜNEN',
            text: fullSpeech,
            textLength: fullSpeech.length,
            protokollId: 908,
            dokumentnummer: '21/83',
            datum: '2026-05-12',
            wahlperiode: 21,
            herausgeber: 'BT',
            speechType: 'rede',
            topTitle: 'Klimaschutz',
          },
        ],
      })
    );

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const { items } = await client.searchSpeeches({ query: 'Klimaschutz' });

    expect(items).toHaveLength(1);
    const speech = items[0];
    expect(speech.excerpt.length).toBeLessThanOrEqual(601); // 600 + ellipsis
    expect(speech.excerpt.endsWith('…')).toBe(true);
    expect(speech.score).toBeCloseTo(1.67);
    expect(speech.protokollNummer).toBe('21/83');
    expect(speech.herausgeber).toBe('BT');
    // Raw DIP keys must not leak into the DTO
    expect(speech).not.toHaveProperty('text');
    expect(speech).not.toHaveProperty('textLength');
    expect(speech).not.toHaveProperty('protokollId');
  });

  it('drops items without speaker or text instead of failing the whole list', async () => {
    fetchMock.mockResolvedValueOnce(
      mcpResponse({
        results: [
          { score: '0.9', speaker: 'A. Bgeordnete', text: 'Kurze Rede.' },
          { score: '0.8', speaker: null, text: 'Verwaiste Rede.' },
          { score: 'not-a-number', speaker: 'B. Kanzler', text: 'Noch eine Rede.' },
        ],
      })
    );

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const { items } = await client.searchSpeeches({ query: 'x', wahlperiode: 21 });

    expect(items.map((s) => s.speaker)).toEqual(['A. Bgeordnete', 'B. Kanzler']);
    expect(items[1].score).toBe(0);
  });
});

describe('BundestagMCPClient — semantic abstract cleaning', () => {
  it('decodes HTML entities, strips tags and caps the abstract at 400 chars', async () => {
    const dirty = `&amp;quot;Zitat&amp;quot; &lt;strong&gt;wichtig&lt;/strong&gt;&lt;br/&gt;${'Lang '.repeat(120)}`;
    fetchMock.mockResolvedValueOnce(
      mcpResponse({
        results: [
          {
            score: '0.860',
            docType: 'vorgang',
            docId: 321610,
            entityType: 'Gesetzgebung',
            title: 'Wärmeplanungsgesetz',
            abstract: dirty,
            dokumentnummer: '20/8654',
            date: '2023-10-13',
            wahlperiode: 20,
          },
        ],
      })
    );

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const { items } = await client.semanticSearch({ query: 'Wärmeplanung', wahlperiode: 20 });

    expect(items).toHaveLength(1);
    const hit = items[0];
    expect(hit.abstract).not.toBeNull();
    expect(hit.abstract).toContain('"Zitat" wichtig');
    expect(hit.abstract).not.toMatch(/<|&\w+;/);
    expect((hit.abstract as string).length).toBeLessThanOrEqual(401); // 400 + ellipsis
    expect(hit.docId).toBe('321610');
    expect(hit.score).toBeCloseTo(0.86);
  });
});

describe('BundestagMCPClient — Wahlperiode defaults & fallback', () => {
  it('injects the current Wahlperiode by default and passes pinned values through', async () => {
    fetchMock.mockResolvedValue(mcpResponse({ results: [{ title: 'Treffer', docType: 'x' }] }));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await client.semanticSearch({ query: 'a' });
    expect(sentArgs(0).wahlperiode).toBe(CURRENT_WAHLPERIODE);

    await client.semanticSearch({ query: 'b', wahlperiode: 19 });
    expect(sentArgs(1).wahlperiode).toBe(19);
  });

  it('retries once without the period filter when the default yields nothing', async () => {
    fetchMock
      .mockResolvedValueOnce(mcpResponse({ results: [] }))
      .mockResolvedValueOnce(mcpResponse({ results: [{ title: 'Alt-Treffer', docType: 'x' }] }));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const result = await client.semanticSearch({ query: 'Heizungsgesetz' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentArgs(0).wahlperiode).toBe(CURRENT_WAHLPERIODE);
    expect(sentArgs(1).wahlperiode).toBeUndefined();
    expect(result.wpFallback).toBe(true);
    expect(result.items[0].title).toBe('Alt-Treffer');
  });

  it('does not retry when the caller pinned a Wahlperiode', async () => {
    fetchMock.mockResolvedValueOnce(mcpResponse({ results: [] }));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const result = await client.semanticSearch({ query: 'x', wahlperiode: 18 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ items: [], wpFallback: false });
  });

  it('legacy searchDrucksachen now defaults to the current Wahlperiode', async () => {
    fetchMock.mockResolvedValueOnce(mcpResponse({ results: [] }));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await client.searchDrucksachen({ query: 'Klima' });

    expect(sentArgs(0).wahlperiode).toBe(CURRENT_WAHLPERIODE);
  });
});

describe('BundestagMCPClient — findDrucksache', () => {
  it('queries by dokumentnummer without a period filter, pins compact fields, flattens urheber', async () => {
    fetchMock.mockResolvedValueOnce(
      mcpResponse({
        results: [
          {
            id: 280001,
            titel: 'Entwurf eines Gesetzes',
            dokumentnummer: '21/123',
            drucksachetyp: 'Gesetzentwurf',
            wahlperiode: 21,
            datum: '2026-03-01',
            urheber: [{ titel: 'Bundesregierung' }, 'Fraktion BÜNDNIS 90/DIE GRÜNEN'],
            fundstelle: { pdf_url: 'https://dserver.bundestag.de/btd/21/001/2100123.pdf' },
          },
        ],
      })
    );

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    const { items } = await client.findDrucksache({ dokumentnummer: '21/123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentArgs(0).dokumentnummer).toBe('21/123');
    expect(sentArgs(0).wahlperiode).toBeUndefined();
    expect(sentArgs(0).fields).toBe('compact');

    const doc = items[0];
    expect(doc.urheber).toEqual(['Bundesregierung', 'Fraktion BÜNDNIS 90/DIE GRÜNEN']);
    expect(doc.pdfUrl).toBe('https://dserver.bundestag.de/btd/21/001/2100123.pdf');
    expect(doc).not.toHaveProperty('fundstelle');
  });
});

describe('BundestagMCPClient — error degradation', () => {
  it('returns an empty list when the network call fails — and does not cache it', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await expect(client.semanticSearch({ query: 'x' })).resolves.toEqual({
      items: [],
      wpFallback: false,
    });
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('returns an empty list on a JSON-RPC error response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Invalid params' },
      }),
    });

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await expect(client.searchSpeeches({ query: 'x' })).resolves.toEqual({
      items: [],
      wpFallback: false,
    });
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('treats an in-band server error payload as a failure, not an empty result', async () => {
    // Live shape when the server's Qdrant backend is down.
    fetchMock.mockResolvedValue(
      mcpResponse({
        error: true,
        message: 'Qdrant vector database not available.',
        endpoint: 'semantic_search',
      })
    );

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await expect(client.semanticSearch({ query: 'x' })).resolves.toEqual({
      items: [],
      wpFallback: false,
    });
    expect(setCachedJson).not.toHaveBeenCalled(); // a 10min-TTL cache poisoning would hide recovery
  });

  it('caches genuine no-result responses', async () => {
    fetchMock.mockResolvedValue(mcpResponse({ success: true, results: [] }));

    const client = new BundestagMCPClient('https://bundestag-mcp.test');
    await client.findDrucksache({ dokumentnummer: '21/99999' });

    expect(setCachedJson).toHaveBeenCalledTimes(1);
  });
});
