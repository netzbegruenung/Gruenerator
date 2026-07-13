import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { buildChatToolCatalog } from './toolCatalog.js';

import type { AgentConfig } from './types.js';

// Keep the catalog light: createSearchTools pulls in Qdrant/directSearch, and
// the crawl/SSRF modules pull in the URL crawler — we only exercise scrape_url.
vi.mock('./searchTools.js', () => ({ createSearchTools: () => ({}) }));

const validateUrlForFetch = vi.fn();
const selectAndCrawlTopUrls = vi.fn();
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (u: string) => validateUrlForFetch(u),
}));
vi.mock('../../../services/search/index.js', () => ({
  selectAndCrawlTopUrls: (seeds: unknown, q: unknown, opts: unknown) =>
    selectAndCrawlTopUrls(seeds, q, opts),
}));

const agentConfig = { identifier: 'test' } as unknown as AgentConfig;

function scrapeTool() {
  const sourceRegistry = createSourceRegistry();
  const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
  const execute = (
    tools.scrape_url as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }
  ).execute;
  return { execute, sourceRegistry };
}

describe('toolCatalog scrape_url', () => {
  beforeEach(() => {
    validateUrlForFetch.mockReset();
    selectAndCrawlTopUrls.mockReset();
  });

  it('rejects when no URL passes SSRF validation (never crawls)', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: false, error: 'Host is blocked' });
    const { execute } = scrapeTool();
    const out = (await execute({ urls: ['http://169.254.169.254/'] }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toBeTruthy();
    expect(selectAndCrawlTopUrls).not.toHaveBeenCalled();
  });

  it('crawls validated URLs and registers content as sources', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    selectAndCrawlTopUrls.mockResolvedValue([
      { url: 'https://example.com/', crawled: true, fullContent: 'Hallo Welt Inhalt' },
    ]);
    const { execute, sourceRegistry } = scrapeTool();
    const out = (await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' })) as {
      resultCount?: number;
      sources?: string;
    };
    expect(out.resultCount).toBe(1);
    expect(out.sources).toMatch(/^\[1\]/);
    expect(sourceRegistry.size).toBe(1);
  });

  it('returns an error result when nothing could be crawled', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    selectAndCrawlTopUrls.mockResolvedValue([
      { url: 'https://example.com/', crawled: false, crawlError: 'timeout' },
    ]);
    const { execute } = scrapeTool();
    const out = (await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toMatch(/nicht lesen/);
  });
});
