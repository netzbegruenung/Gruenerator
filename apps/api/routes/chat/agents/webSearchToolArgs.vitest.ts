/**
 * `web_search`'s `execute` maps the model's tool-call arguments (`seiten`,
 * `zeitraum`, `bilder`, …) onto `executeDirectWebSearch`'s params before the
 * commission tests in `webSearchCommission.vitest.ts` ever run. This is the
 * other half of the same wiring gap: mocking `executeDirectWebSearch` isolates
 * the mapping itself — host normalisation, the `anytime` no-op, the
 * `bilder` → `includeImages` rename — from the Linkup call it eventually feeds.
 *
 * Calling `tool.execute(...)` directly (as this file does) bypasses the AI SDK's
 * zod-schema defaulting, so every test supplies the fields it cares about
 * explicitly rather than relying on `.default(...)` in the schema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteDirectWebSearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('./directSearch.js', () => ({
  executeDirectSearch: vi.fn(),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectPressemitteilungExamples: vi.fn(),
  executeDirectWebSearch: (...args: unknown[]) => mockExecuteDirectWebSearch(...args),
}));

const { createSearchTools } = await import('./searchTools.js');

import type { AgentConfig } from './types.js';

const AGENT = {
  identifier: 'gruenerator-universal',
  provider: 'mistral',
  model: 'mistral-medium-2604',
  params: {},
} as unknown as AgentConfig;

type WebSearchTool = {
  execute: (
    input: unknown,
    options: { toolCallId: string; messages: unknown[] }
  ) => Promise<unknown>;
};

function webSearchTool(): WebSearchTool {
  return createSearchTools(AGENT).web_search as unknown as WebSearchTool;
}

const TOOL_OPTS = { toolCallId: 'c1', messages: [] };

beforeEach(() => {
  mockExecuteDirectWebSearch.mockReset();
  mockExecuteDirectWebSearch.mockResolvedValue({
    query: '',
    searchType: 'general',
    resultsCount: 0,
    results: [],
  });
});

function lastArgs(): Record<string, unknown> {
  expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(1);
  return mockExecuteDirectWebSearch.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('web_search tool — argument mapping onto executeDirectWebSearch', () => {
  it('normalises a URL-shaped seiten entry to a bare host', async () => {
    await webSearchTool().execute(
      {
        query: 'Windkraft Ausbau',
        searchType: 'general',
        tiefe: 'standard',
        seiten: ['https://www.zeit.de/'],
      },
      TOOL_OPTS
    );
    expect(lastArgs().includeDomains).toEqual(['zeit.de']);
  });

  it('sets no date constraint for zeitraum: anytime', async () => {
    await webSearchTool().execute(
      {
        query: 'Windkraft Ausbau',
        searchType: 'general',
        tiefe: 'standard',
        zeitraum: 'anytime',
      },
      TOOL_OPTS
    );
    // `anytime` means "no preference", not a window to send — the executor only
    // ever reads `timeRange` when the key is present at all.
    expect(lastArgs()).not.toHaveProperty('timeRange');
  });

  it('maps bilder: true onto includeImages: true', async () => {
    await webSearchTool().execute(
      {
        query: 'Fotos von der Klimademo',
        searchType: 'general',
        tiefe: 'standard',
        bilder: true,
      },
      TOOL_OPTS
    );
    expect(lastArgs().includeImages).toBe(true);
  });
});
