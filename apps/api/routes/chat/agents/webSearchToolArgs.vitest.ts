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

// `userLocale` is required on the factory (see CreateSearchToolsOptions), but
// nothing in this file is about the locale — these cases only exercise the
// web_search arguments. So the helper supplies the neutral one and lets a case
// override it along with anything else.
function webSearchTool(options?: Partial<Parameters<typeof createSearchTools>[1]>): WebSearchTool {
  return createSearchTools(AGENT, { userLocale: null, ...options })
    .web_search as unknown as WebSearchTool;
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

  /**
   * Images are not something the model asks for any more. The `bilder` argument
   * is gone: it made an explicit image request depend on the planner remembering
   * a flag, one node after the classifier had already answered that question.
   */
  it('asks for image hits when the classifier said so', async () => {
    await webSearchTool({ wantsImages: true }).execute(
      { query: 'Marilyn Monroe', searchType: 'general', tiefe: 'standard' },
      TOOL_OPTS
    );
    expect(lastArgs().includeImages).toBe(true);
  });

  it('leaves them out otherwise — pictures beside a paragraph of law are noise', async () => {
    await webSearchTool().execute(
      { query: 'Grunderwerbsteuer berechnen', searchType: 'general', tiefe: 'standard' },
      TOOL_OPTS
    );
    expect(lastArgs()).not.toHaveProperty('includeImages');
  });

  it('ignores a stored `bilder` from a replayed pre-rollout call', async () => {
    // Persisted tool calls still carry the old argument. The schema strips
    // unknown keys, so a replay must neither throw nor resurrect the old switch.
    await webSearchTool().execute(
      { query: 'Fotos von der Klimademo', searchType: 'general', tiefe: 'standard', bilder: true },
      TOOL_OPTS
    );
    expect(lastArgs()).not.toHaveProperty('includeImages');
  });
});

/**
 * The narrowing arguments. Both were measured live on the same turn
 * ("recherchiere im netz: wer war Marilyn Monroe"): the planner asked for
 * `tiefe: gruendlich` and then capped it with `maxResults: 5`, and it scoped the
 * whole web to three hosts the user had never mentioned. Neither shows up in the
 * answer — it just reads thin and one-sided — so both need enforcement rather
 * than a line in the tool description.
 */
describe('web_search tool — the model may not quietly narrow the search', () => {
  it('ignores a maxResults the model still sends, leaving the tier in charge', async () => {
    await webSearchTool().execute(
      {
        query: 'Marilyn Monroe Leben Karriere',
        searchType: 'general',
        tiefe: 'gruendlich',
        maxResults: 5,
      },
      TOOL_OPTS
    );
    expect(lastArgs()).not.toHaveProperty('maxResults');
  });

  it('drops a site scope the user never named', async () => {
    await webSearchTool({ userText: 'recherchiere im netz: wer war Marilyn Monroe' }).execute(
      {
        query: 'Marilyn Monroe Leben Karriere',
        searchType: 'general',
        tiefe: 'gruendlich',
        seiten: ['wikipedia.de', 'spiegel.de', 'faz.net'],
      },
      TOOL_OPTS
    );
    expect(lastArgs()).not.toHaveProperty('includeDomains');
  });

  it('keeps the sites the user did name, however they wrote them', async () => {
    await webSearchTool({ userText: 'Such bitte auf zeit.de und beim ORF nach dem Thema' }).execute(
      {
        query: 'Windkraft Ausbau',
        searchType: 'general',
        tiefe: 'gruendlich',
        seiten: ['https://www.zeit.de/', 'orf.at', 'bild.de'],
      },
      TOOL_OPTS
    );
    // `bild.de` was invented; the other two survive — one written as a URL, one
    // named only by its brand.
    expect(lastArgs().includeDomains).toEqual(['zeit.de', 'orf.at']);
  });

  it('skips the check entirely when there is no user turn to check against', async () => {
    // Document authoring and the board agent build the same tools without a
    // chat message. Absent context must not silently ban every site scope.
    await webSearchTool().execute(
      {
        query: 'Windkraft Ausbau',
        searchType: 'general',
        tiefe: 'gruendlich',
        seiten: ['zeit.de'],
      },
      TOOL_OPTS
    );
    expect(lastArgs().includeDomains).toEqual(['zeit.de']);
  });
});
