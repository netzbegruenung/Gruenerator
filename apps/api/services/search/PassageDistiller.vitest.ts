import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { distillPassages } from './PassageDistiller.js';

import type { AIWorkerPool } from '../../workers/types.js';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const rerankPipeline = vi.fn();
vi.mock('./rerankPipeline.js', () => ({
  rerankPipeline: (...args: unknown[]) => rerankPipeline(...args),
  DEFAULT_RELEVANCE: 0.5,
}));

const getCachedDistill = vi.fn();
const setCachedDistill = vi.fn();
vi.mock('./distillCache.js', () => ({
  getCachedDistill: (...args: unknown[]) => getCachedDistill(...args),
  setCachedDistill: (...args: unknown[]) => setCachedDistill(...args),
}));

/** Distinct paragraphs so we can assert which ones survived and in what order. */
function page(markers: string[], filler = 60): string {
  return markers.map((m) => `${m} ${'Fülltext dazu. '.repeat(filler)}`).join('\n\n');
}

const FOUR_BLOCKS = page(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);

/** Ranks by the position of each marker in `order`, best first. */
function rerankRanking(order: string[]) {
  return (opts: { items: Array<{ content: string }> }) => ({
    rankedIndices: opts.items.map((_, i) => i),
    scores: new Map(
      opts.items.map((item, i) => {
        const idx = order.findIndex((marker) => item.content.includes(marker));
        return [i, idx < 0 ? 0 : order.length - idx];
      })
    ),
    rerankTimeMs: 3,
  });
}

function makePool(content = '- Verdichteter Fakt.'): AIWorkerPool {
  return {
    processRequest: vi.fn().mockResolvedValue({ content }),
    shutdown: vi.fn(),
  } as unknown as AIWorkerPool;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHAT_PASSAGE_DISTILL = 'true';
  process.env.CHAT_PASSAGE_DISTILL_LLM = 'false';
  process.env.REGOLO_API_KEY = 'test-key';
  getCachedDistill.mockResolvedValue(null);
  setCachedDistill.mockResolvedValue(undefined);
  rerankPipeline.mockImplementation(rerankRanking(['CHARLIE', 'ALPHA', 'DELTA', 'BRAVO']));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const base = { query: 'Beitragssatz', mode: 'query-focused' as const, targetChars: 600 };

describe('distillPassages', () => {
  describe('the kill switch', () => {
    it('does no work at all when disabled', async () => {
      process.env.CHAT_PASSAGE_DISTILL = 'false';
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.method).toBe('disabled');
      expect(rerankPipeline).not.toHaveBeenCalled();
      expect(out.digest.length).toBeLessThanOrEqual(600);
    });

    it('defaults to disabled when the variable is unset', async () => {
      delete process.env.CHAT_PASSAGE_DISTILL;
      expect((await distillPassages({ ...base, text: FOUR_BLOCKS })).method).toBe('disabled');
    });
  });

  describe('selection', () => {
    it('joins kept passages in DOCUMENT order, not score order', async () => {
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS, targetChars: 2500 });
      const positions = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']
        .map((m) => out.digest.indexOf(m))
        .filter((p) => p >= 0);
      expect(positions.length).toBeGreaterThan(1);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('keeps the best-scoring passage when the budget only fits one', async () => {
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS, targetChars: 900 });
      expect(out.digest).toContain('CHARLIE');
      expect(out.method).toBe('cross-encoder');
    });

    it('reports firstRelevantOffset at the winner’s position in the ORIGINAL text', async () => {
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS, targetChars: 900 });
      expect(out.firstRelevantOffset).toBe(FOUR_BLOCKS.indexOf('CHARLIE'));
      expect(out.firstRelevantOffset).toBeGreaterThan(1200);
    });

    it('turns MMR off and lifts the pipeline’s own limits', async () => {
      await distillPassages({ ...base, text: FOUR_BLOCKS });
      const opts = rerankPipeline.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(opts.applyDiversity).toBe(false);
      expect(opts.minRelevance).toBe(0);
      expect(opts.minKeep).toBe(opts.inputLimit);
      expect(opts.query).toBe('Beitragssatz');
    });

    it('passes the section heading as the item title', async () => {
      const withHeadings = `## Beiträge\n\n${page(['ALPHA'])}\n\n## Sonstiges\n\n${page(['BRAVO'])}\n\n## Anhang\n\n${page(['CHARLIE'])}`;
      await distillPassages({ ...base, text: withHeadings });
      const opts = rerankPipeline.mock.calls[0]?.[0] as { items: Array<{ title: string }> };
      expect(opts.items.map((i) => i.title)).toContain('Beiträge');
    });
  });

  describe('degradation is honest', () => {
    it('reports lexical, never cross-encoder, when the pipeline failed', async () => {
      rerankPipeline.mockResolvedValue({
        rankedIndices: [0, 1, 2, 3],
        scores: new Map(),
        rerankTimeMs: 1,
        failed: true,
        error: 'boom',
      });
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.method).toBe('lexical');
      expect(out.digest.length).toBeGreaterThan(0);
    });

    it('never calls the cross-encoder without an API key', async () => {
      delete process.env.REGOLO_API_KEY;
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(rerankPipeline).not.toHaveBeenCalled();
      expect(out.method).toBe('lexical');
    });

    it('picks the query-bearing passage on the lexical path', async () => {
      delete process.env.REGOLO_API_KEY;
      const text = FOUR_BLOCKS.replace(
        'CHARLIE',
        'CHARLIE Der Beitragssatz steigt auf 3,6 Prozent.'
      );
      const out = await distillPassages({ ...base, text, targetChars: 1000 });
      expect(out.method).toBe('lexical');
      expect(out.digest).toContain('CHARLIE');
    });

    it('labels a ≤2-chunk page passthrough instead of faking coverage', async () => {
      const out = await distillPassages({ ...base, text: page(['ALPHA', 'BRAVO'], 30) });
      expect(out.method).toBe('passthrough');
      expect(rerankPipeline).not.toHaveBeenCalled();
    });
  });

  describe('invariants', () => {
    it('never returns an empty digest for non-empty input', async () => {
      rerankPipeline.mockResolvedValue({
        rankedIndices: [],
        scores: new Map(),
        rerankTimeMs: 1,
      });
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.digest.length).toBeGreaterThan(0);
    });

    it('respects targetChars', async () => {
      for (const targetChars of [300, 600, 1500, 4000]) {
        const out = await distillPassages({ ...base, text: FOUR_BLOCKS, targetChars });
        expect(out.digest.length, `target=${targetChars}`).toBeLessThanOrEqual(targetChars);
      }
    });

    it('returns short input unchanged without touching the cross-encoder', async () => {
      const out = await distillPassages({ ...base, text: 'Kurz und knapp.', targetChars: 600 });
      expect(out.digest).toBe('Kurz und knapp.');
      expect(rerankPipeline).not.toHaveBeenCalled();
    });

    it('handles empty input', async () => {
      const out = await distillPassages({ ...base, text: '   ' });
      expect(out.digest).toBe('');
      expect(out.firstRelevantOffset).toBe(-1);
    });

    it('never throws, for any input', async () => {
      const inputs = ['', 'x', '\n'.repeat(400), 'A'.repeat(200_000), 'ohne umbruch '.repeat(5000)];
      for (const text of inputs) {
        for (const mode of ['query-focused', 'faithful'] as const) {
          await expect(distillPassages({ ...base, text, mode })).resolves.toBeDefined();
        }
      }
    });

    // The "never throws" contract is what lets every call site drop its
    // try/catch, so it must not depend on rerankPipeline keeping its own.
    it('survives a rejecting cross-encoder', async () => {
      rerankPipeline.mockRejectedValue(new Error('network down'));
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.method).toBe('lexical');
      expect(out.digest.length).toBeGreaterThan(0);
    });
  });

  describe('LLM condensation', () => {
    it('makes no model call when the flag is off', async () => {
      const pool = makePool();
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS, aiWorkerPool: pool });
      expect(pool.processRequest).not.toHaveBeenCalled();
      expect(out.llmUsed).toBe(false);
    });

    it('makes no model call without a pool, even with the flag on', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.llmUsed).toBe(false);
    });

    it('condenses each kept passage when enabled', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const pool = makePool('- Beitragssatz 2027: 3,6 %.');
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        targetChars: 2000,
        aiWorkerPool: pool,
      });
      expect(pool.processRequest).toHaveBeenCalled();
      expect(out.llmUsed).toBe(true);
      expect(out.digest).toContain('3,6 %');
    });

    it('falls back to the raw passage when a call fails, without throwing', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const pool = {
        processRequest: vi
          .fn()
          .mockResolvedValueOnce({ content: '- Fakt.' })
          .mockRejectedValue(new Error('provider down')),
        shutdown: vi.fn(),
      } as unknown as AIWorkerPool;
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        targetChars: 3000,
        aiWorkerPool: pool,
      });
      expect(out.digest.length).toBeGreaterThan(0);
      expect(out.llmUsed).toBe(true);
    });

    it('keeps the selection result when every call times out', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const pool = {
        processRequest: vi.fn(() => new Promise(() => {})),
        shutdown: vi.fn(),
      } as unknown as AIWorkerPool;
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        aiWorkerPool: pool,
        timeoutMs: 20,
      });
      expect(out.llmUsed).toBe(false);
      expect(out.digest.length).toBeGreaterThan(0);
    });

    it('drops a passage the extractor reports as empty', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const pool = makePool('-');
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS, aiWorkerPool: pool });
      expect(out.llmUsed).toBe(false);
    });
  });

  describe('faithful mode', () => {
    it('never scores, so the named page is not filtered by relevance', async () => {
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        mode: 'faithful',
        targetChars: 2000,
      });
      expect(rerankPipeline).not.toHaveBeenCalled();
      // Keeps a document-order prefix rather than the top-scoring passages —
      // the user named this page, they did not ask for a filter on it.
      expect(out.digest.indexOf('ALPHA')).toBe(0);
      expect(out.digest).toContain('BRAVO');
    });

    it('condensation is what makes a long page fit', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        mode: 'faithful',
        targetChars: 2000,
        aiWorkerPool: makePool(),
      });
      expect(out.method).toBe('llm');
      expect(out.keptChunks).toBe(out.totalChunks);
    });
  });

  describe('cache', () => {
    it('is off without a url', async () => {
      const out = await distillPassages({ ...base, text: FOUR_BLOCKS });
      expect(out.cache).toBe('off');
      expect(getCachedDistill).not.toHaveBeenCalled();
      expect(setCachedDistill).not.toHaveBeenCalled();
    });

    it('a hit skips both the cross-encoder and the model', async () => {
      process.env.CHAT_PASSAGE_DISTILL_LLM = 'true';
      getCachedDistill.mockResolvedValue({
        digest: 'zwischengespeichert',
        chunks: [],
        keptChunks: 1,
        totalChunks: 4,
        sourceChars: 9000,
        firstRelevantOffset: 4200,
        method: 'cross-encoder',
        llmUsed: true,
      });
      const pool = makePool();
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        url: 'https://example.org/a',
        aiWorkerPool: pool,
      });
      expect(out.cache).toBe('hit');
      expect(out.digest).toBe('zwischengespeichert');
      expect(rerankPipeline).not.toHaveBeenCalled();
      expect(pool.processRequest).not.toHaveBeenCalled();
    });

    it('writes on a miss', async () => {
      const out = await distillPassages({
        ...base,
        text: FOUR_BLOCKS,
        url: 'https://example.org/a',
      });
      expect(out.cache).toBe('miss');
      expect(setCachedDistill).toHaveBeenCalledTimes(1);
    });
  });
});
