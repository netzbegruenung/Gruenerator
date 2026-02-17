/**
 * Web Search Tool Tests
 *
 * Verifies max_results parameter flows through to search calls,
 * result slicing, and crawl count scaling.
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the tool
vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectWebSearch: vi.fn(),
}));

vi.mock('../../../../services/search/CrawlingService.js', () => ({
  selectAndCrawlTopUrls: vi.fn(),
}));

vi.mock('../../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: vi.fn(),
}));

vi.mock('../../../../services/search/TemporalAnalyzer.js', () => ({
  analyzeTemporality: vi.fn(() => ({ urgency: 'none', suggestedTimeRange: null })),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createWebSearchTool } from './webSearch.js';
import { executeDirectWebSearch } from '../../../../routes/chat/agents/directSearch.js';
import { selectAndCrawlTopUrls } from '../../../../services/search/CrawlingService.js';
import { expandQuery } from '../../../../services/search/QueryExpansionService.js';

import type { ToolDependencies } from './registry.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeDeps(): ToolDependencies {
  return {
    agentConfig: { id: 'test', systemRole: 'test', name: 'Test' } as any,
    aiWorkerPool: {},
    enabledTools: {},
  };
}

function makeSearchResult(count: number) {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      snippet: `Snippet ${i + 1}`,
      domain: 'example.com',
      rank: i + 1,
    })),
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('web_search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: query expansion returns no alternatives
    vi.mocked(expandQuery).mockResolvedValue({ alternatives: [] });

    // Default: crawling returns its input unchanged
    vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
      results.map((r) => ({ ...r, content: r.content || (r as any).snippet || '' }))
    );
  });

  // ==========================================================================
  // Schema validation
  // ==========================================================================

  describe('schema', () => {
    const tool = createWebSearchTool(makeDeps());

    it('has name "web_search"', () => {
      expect(tool.name).toBe('web_search');
    });

    it('schema accepts max_results as optional number', () => {
      const parsed = tool.schema.safeParse({ query: 'test', max_results: 7 });
      expect(parsed.success).toBe(true);
    });

    it('schema accepts omitted max_results', () => {
      const parsed = tool.schema.safeParse({ query: 'test' });
      expect(parsed.success).toBe(true);
    });

    it('schema rejects max_results > 10', () => {
      const parsed = tool.schema.safeParse({ query: 'test', max_results: 15 });
      expect(parsed.success).toBe(false);
    });

    it('schema rejects max_results < 1', () => {
      const parsed = tool.schema.safeParse({ query: 'test', max_results: 0 });
      expect(parsed.success).toBe(false);
    });

    it('schema rejects non-numeric max_results', () => {
      const parsed = tool.schema.safeParse({ query: 'test', max_results: 'many' });
      expect(parsed.success).toBe(false);
    });
  });

  // ==========================================================================
  // max_results propagation
  // ==========================================================================

  describe('max_results propagation', () => {
    it('passes default maxResults=5 to executeDirectWebSearch when omitted', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(5));

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'Grüne Tempolimit' });

      expect(executeDirectWebSearch).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 5 })
      );
    });

    it('passes custom maxResults=3 to executeDirectWebSearch', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(3));

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'Nächster Parteitag', max_results: 3 });

      expect(executeDirectWebSearch).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 3 })
      );
    });

    it('passes custom maxResults=10 to executeDirectWebSearch', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(10));

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'Klimapolitik Vergleich', max_results: 10 });

      expect(executeDirectWebSearch).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 10 })
      );
    });
  });

  // ==========================================================================
  // Result slicing scales with max_results
  // ==========================================================================

  describe('result slicing', () => {
    it('slices to max_results+3 when many results returned', async () => {
      // Return 20 results — should be sliced to max_results + 3
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(20));
      vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
        results.map((r) => ({ ...r, content: (r as any).snippet || '' }))
      );

      const tool = createWebSearchTool(makeDeps());
      const result = await tool.invoke({ query: 'test', max_results: 5 });

      // selectAndCrawlTopUrls receives sliced array (5+3=8 max)
      expect(vi.mocked(selectAndCrawlTopUrls).mock.calls[0][0].length).toBeLessThanOrEqual(8);
    });

    it('slices to 6 for max_results=3', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(20));
      vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
        results.map((r) => ({ ...r, content: (r as any).snippet || '' }))
      );

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'test', max_results: 3 });

      expect(vi.mocked(selectAndCrawlTopUrls).mock.calls[0][0].length).toBeLessThanOrEqual(6);
    });
  });

  // ==========================================================================
  // Crawl count scales with max_results
  // ==========================================================================

  describe('crawl scaling', () => {
    it('crawls maxUrls=1 for max_results=3', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(5));
      vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
        results.map((r) => ({ ...r, content: (r as any).snippet || '' }))
      );

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'test', max_results: 3 });

      // Math.min(2, Math.ceil(3/4)) = Math.min(2, 1) = 1
      expect(selectAndCrawlTopUrls).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ maxUrls: 1 })
      );
    });

    it('crawls maxUrls=2 for max_results=5 (default)', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(5));
      vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
        results.map((r) => ({ ...r, content: (r as any).snippet || '' }))
      );

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'test' });

      // Math.min(2, Math.ceil(5/4)) = Math.min(2, 2) = 2
      expect(selectAndCrawlTopUrls).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ maxUrls: 2 })
      );
    });

    it('crawls maxUrls=2 for max_results=10 (capped)', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(10));
      vi.mocked(selectAndCrawlTopUrls).mockImplementation(async (results) =>
        results.map((r) => ({ ...r, content: (r as any).snippet || '' }))
      );

      const tool = createWebSearchTool(makeDeps());
      await tool.invoke({ query: 'test', max_results: 10 });

      // Math.min(2, Math.ceil(10/4)) = Math.min(2, 3) = 2
      expect(selectAndCrawlTopUrls).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ maxUrls: 2 })
      );
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('returns fallback message when no results found', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue({ results: [] });
      vi.mocked(selectAndCrawlTopUrls).mockResolvedValue([]);

      const tool = createWebSearchTool(makeDeps());
      const result = await tool.invoke({ query: 'nonexistent topic' });

      expect(result).toBe('Keine Websuche-Ergebnisse gefunden.');
    });

    it('handles crawling failure gracefully', async () => {
      vi.mocked(executeDirectWebSearch).mockResolvedValue(makeSearchResult(3));
      vi.mocked(selectAndCrawlTopUrls).mockRejectedValue(new Error('Crawl timeout'));

      const tool = createWebSearchTool(makeDeps());
      const result = await tool.invoke({ query: 'test' });

      // Should still return results (pre-crawl)
      expect(result).toContain('Web-Ergebnisse gefunden');
    });

    it('handles search failure gracefully', async () => {
      vi.mocked(executeDirectWebSearch).mockRejectedValue(new Error('SearXNG down'));

      const tool = createWebSearchTool(makeDeps());
      const result = await tool.invoke({ query: 'test' });

      expect(result).toBe('Keine Websuche-Ergebnisse gefunden.');
    });
  });
});
