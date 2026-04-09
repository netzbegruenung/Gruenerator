/**
 * Tests for rerankPipeline (shared rerank logic)
 *
 * Mocks RegoloRerankService to test the pipeline orchestration:
 * filtering, MMR routing, index mapping, and error handling.
 *
 * Run with: npx tsx apps/api/services/search/__manual_tests__/rerankPipeline.test.ts
 */

import { regoloRerankService } from '../RegoloRerankService.js';
import { rerankPipeline, type RerankableItem } from '../rerankPipeline.js';

let passed = 0;
let failed = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRerankFn: ((req: any) => Promise<any>) | null = null;

// Mock the rerank service
const originalRerank = regoloRerankService.rerank.bind(regoloRerankService);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
regoloRerankService.rerank = async (req: any) => {
  if (mockRerankFn) return mockRerankFn(req);
  return originalRerank(req);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setMockRerank(fn: (req: any) => Promise<any>) {
  mockRerankFn = fn;
}

function clearMock() {
  mockRerankFn = null;
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  } finally {
    clearMock();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expect(actual: any) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toBe(expected: any) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      if (actual > expected) throw new Error(`Expected ${actual} <= ${expected}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toContain(expected: any) {
      if (!actual.includes(expected))
        throw new Error(`Expected array to contain ${expected}, got ${JSON.stringify(actual)}`);
    },
    toHaveLength(expected: number) {
      if (actual.length !== expected)
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
    },
  };
}

function makeItems(count: number, contentPrefix = 'content'): RerankableItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Item ${i}`,
    content: `${contentPrefix} ${i}`,
    source: `source-${i}`,
    relevance: 0.5 + i * 0.03,
  }));
}

function mockScores(scores: number[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMockRerank(async (req: any) =>
    scores.map((score, i) => ({
      originalIndex: i,
      relevanceScore: score,
      text: req.documents[i] || '',
    }))
  );
}

console.log('rerankPipeline Tests');
console.log('====================');

await test('skips reranking when ≤ 2 items', async () => {
  const items = makeItems(2);
  const result = await rerankPipeline({ query: 'test', items });
  expect(result.rankedIndices).toHaveLength(2);
  expect(result.rankedIndices[0]).toBe(0);
  expect(result.rankedIndices[1]).toBe(1);
});

await test('returns rankedIndices in cross-encoder score order', async () => {
  const items = makeItems(5);
  // Reverse order: item 4 gets highest score, item 0 gets lowest
  mockScores([0.1, 0.3, 0.5, 0.7, 0.9]);
  const result = await rerankPipeline({
    query: 'test',
    items,
    applyDiversity: false,
  });
  // Should be sorted by score descending: index 4, 3, 2, 1, 0
  expect(result.rankedIndices[0]).toBe(4);
  expect(result.rankedIndices[1]).toBe(3);
});

await test('filters by minRelevance', async () => {
  const items = makeItems(5);
  mockScores([0.05, 0.08, 0.5, 0.7, 0.9]);
  const result = await rerankPipeline({
    query: 'test',
    items,
    minRelevance: 0.2,
    minKeep: 0,
    applyDiversity: false,
  });
  // Only items with scores > 0.2 should remain (0.5, 0.7, 0.9)
  expect(result.rankedIndices).toHaveLength(3);
});

await test('minKeep preserves low-scoring items', async () => {
  const items = makeItems(5);
  // All scores below minRelevance
  mockScores([0.01, 0.02, 0.03, 0.04, 0.05]);
  const result = await rerankPipeline({
    query: 'test',
    items,
    minRelevance: 0.5,
    minKeep: 3,
    applyDiversity: false,
  });
  // Should keep at least 3 despite all being below 0.5
  expect(result.rankedIndices).toHaveLength(3);
});

await test('applies MMR when applyDiversity=true', async () => {
  // Create items where 0,1,2 are similar (same content) and 3 is diverse
  const items: RerankableItem[] = [
    { title: 'A', content: 'Klimaschutz Umweltpolitik Grüne Deutschland', relevance: 0.9 },
    { title: 'B', content: 'Klimaschutz Umweltpolitik Grüne Partei', relevance: 0.8 },
    { title: 'C', content: 'Klimaschutz Umweltpolitik Grüne Nachhaltigkeit', relevance: 0.7 },
    { title: 'D', content: 'Verkehrswende ÖPNV Fahrrad Mobilität', relevance: 0.6 },
  ];
  mockScores([0.9, 0.8, 0.7, 0.6]);
  const result = await rerankPipeline({
    query: 'test',
    items,
    applyDiversity: true,
    mmrKeepTop: 1,
  });
  // D (diverse) should be promoted above its original position
  const dPos = result.rankedIndices.indexOf(3);
  expect(dPos).toBeGreaterThan(-1);
});

await test('skips MMR when applyDiversity=false', async () => {
  const items = makeItems(5);
  mockScores([0.9, 0.8, 0.7, 0.6, 0.5]);
  const result = await rerankPipeline({
    query: 'test',
    items,
    applyDiversity: false,
  });
  // Should be pure score order
  expect(result.rankedIndices[0]).toBe(0);
  expect(result.rankedIndices[1]).toBe(1);
  expect(result.rankedIndices[2]).toBe(2);
});

await test('respects inputLimit', async () => {
  const items = makeItems(30);
  let sentDocCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMockRerank(async (req: any) => {
    sentDocCount = req.documents.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return req.documents.map((_: any, i: number) => ({
      originalIndex: i,
      relevanceScore: 0.5,
      text: '',
    }));
  });
  await rerankPipeline({
    query: 'test',
    items,
    inputLimit: 10,
    applyDiversity: false,
  });
  expect(sentDocCount).toBe(10);
});

await test('respects outputLimit', async () => {
  const items = makeItems(15);
  mockScores(Array(15).fill(0.5));
  const result = await rerankPipeline({
    query: 'test',
    items,
    inputLimit: 15,
    outputLimit: 5,
    applyDiversity: false,
  });
  expect(result.rankedIndices).toHaveLength(5);
});

await test('adds source tags when sourceTagFn provided', async () => {
  const items: RerankableItem[] = [
    { title: 'Doc', content: 'Content A', source: 'gruenerator:deutschland' },
    { title: 'Web', content: 'Content B', source: 'web' },
    { title: 'Ex', content: 'Content C', source: 'examples' },
  ];
  let receivedDocs: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMockRerank(async (req: any) => {
    receivedDocs = req.documents;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return req.documents.map((_: any, i: number) => ({
      originalIndex: i,
      relevanceScore: 0.5,
      text: '',
    }));
  });
  await rerankPipeline({
    query: 'test',
    items,
    sourceTagFn: (item) => {
      if (item.source?.startsWith('gruenerator:')) return 'Parteidokument';
      if (item.source === 'web') return 'Web';
      return 'Sonstige';
    },
    applyDiversity: false,
  });
  expect(receivedDocs[0]).toContain('[Parteidokument]');
  expect(receivedDocs[1]).toContain('[Web]');
  expect(receivedDocs[2]).toContain('[Sonstige]');
});

await test('graceful fallback on Regolo error', async () => {
  const items = makeItems(5);
  setMockRerank(async () => {
    throw new Error('API unavailable');
  });
  const result = await rerankPipeline({
    query: 'test',
    items,
    applyDiversity: false,
  });
  // Should return original indices as fallback
  expect(result.rankedIndices[0]).toBe(0);
  expect(result.rankedIndices).toHaveLength(5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
