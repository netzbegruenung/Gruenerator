/**
 * The monitor summary forks its political context per locale (#4080): an
 * Austrian entity must not be briefed as if the Greens sat in the Bundestag.
 *
 * Run: `npx vitest run services/monitor/SummaryGraph.vitest.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../ai/providers.js', () => ({ getMonitorModel: () => ({}) }));

const facts = [1, 2, 3].map((i) => ({
  actor: `Person${i}`,
  action: 'sagt etwas',
  context: `Thema${i}`,
  sourceUrl: `https://example.org/${i}`,
  sourceName: 'Quelle',
}));

const generateObject = vi.fn();
const generateText = vi.fn();
vi.mock('ai', () => ({ generateObject, generateText }));

const executeDirectSearch = vi.fn(async () => ({ results: [] }));
vi.mock('../../routes/chat/agents/directSearch.js', () => ({ executeDirectSearch }));

const { generateEntitySummary } = await import('./SummaryGraph.js');

const articles = [{ title: 'T', url: 'https://example.org/1', source: 'Q', excerpt: 'E' }] as never;

beforeEach(() => {
  vi.clearAllMocks();
  generateObject
    .mockResolvedValueOnce({ object: { facts } })
    .mockResolvedValueOnce({ object: { risks: [], opportunities: [] } });
  generateText.mockResolvedValue({ text: 'Briefing' });
});

function systemPrompts(): string {
  return [...generateObject.mock.calls, ...generateText.mock.calls]
    .map(([arg]) => (arg as { system: string }).system)
    .join('\n');
}

describe('generateEntitySummary locale context', () => {
  it('uses the Austrian context and programme collection for at', async () => {
    await generateEntitySummary('Die Grünen', articles, 'at');

    const prompts = systemPrompts();
    expect(prompts).toContain('Die Grünen – Die Grüne Alternative (Österreich)');
    expect(prompts).toContain('Nationalrat');
    expect(prompts).not.toMatch(/Merz|Bundestag|Bündnis 90/);
    expect(executeDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'oesterreich' })
    );
  });

  it('keeps the German context for de', async () => {
    await generateEntitySummary('Die Grünen', articles, 'de');

    const prompts = systemPrompts();
    expect(prompts).toContain('Risikoanalyst*in für Bündnis 90/Die Grünen');
    expect(prompts).toContain('Friedrich Merz');
    expect(executeDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'deutschland' })
    );
  });
});
