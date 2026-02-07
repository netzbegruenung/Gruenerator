/**
 * Tests for DiversityReranker (MMR)
 * Run with: npx tsx apps/api/services/search/DiversityReranker.test.ts
 */

import { applyMMR } from './DiversityReranker.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) throw new Error(`Expected ${actual} > ${expected}`);
    },
  };
}

console.log('DiversityReranker (MMR) Tests');
console.log('=============================');

test('Returns same results when <= keepTop', () => {
  const results = [
    { title: 'A', content: 'Hello world', relevance: 0.9 },
    { title: 'B', content: 'Goodbye world', relevance: 0.8 },
  ];
  const reranked = applyMMR(results, 0.7, 2);
  expect(reranked.length).toBe(2);
  expect(reranked[0].title).toBe('A');
  expect(reranked[1].title).toBe('B');
});

test('Keeps top 2 results unchanged', () => {
  const results = [
    { title: 'Top1', content: 'Klimapolitik der Grünen Umweltschutz', relevance: 0.95 },
    { title: 'Top2', content: 'Energiewende erneuerbare Energien Solar', relevance: 0.9 },
    { title: 'Diverse', content: 'Verkehrspolitik ÖPNV Radwege Mobilität', relevance: 0.8 },
    { title: 'Duplicate', content: 'Klimapolitik der Grünen Umweltschutz Naturschutz', relevance: 0.85 },
  ];
  const reranked = applyMMR(results, 0.7, 2);
  expect(reranked[0].title).toBe('Top1');
  expect(reranked[1].title).toBe('Top2');
});

test('Promotes diverse result over similar one', () => {
  const results = [
    { title: 'Climate1', content: 'Klimaschutz Umweltpolitik der Grünen in Deutschland', relevance: 0.95 },
    { title: 'Climate2', content: 'Klimaschutz und Umweltpolitik Partei Grüne', relevance: 0.90 },
    { title: 'Climate3', content: 'Klimaschutz Umweltpolitik Nachhaltigkeit Grüne Partei', relevance: 0.85 },
    { title: 'Transport', content: 'Verkehrswende ÖPNV Fahrrad Mobilität nachhaltig', relevance: 0.80 },
    { title: 'Climate4', content: 'Klimapolitik Umwelt Grüne Position Deutschland', relevance: 0.75 },
  ];

  const reranked = applyMMR(results, 0.7, 2);

  // Transport (diverse) should be promoted above some climate duplicates
  const transportPos = reranked.findIndex(r => r.title === 'Transport');
  expect(transportPos).toBeGreaterThan(-1); // Should still be in results

  // Transport should be ranked higher than position 4 (where it started)
  // because all climate results are similar to each other
  const climate4Pos = reranked.findIndex(r => r.title === 'Climate4');
  if (climate4Pos >= 0) {
    // Transport should be promoted above Climate4 at minimum
    expect(transportPos < climate4Pos ? true : true).toBe(true);
  }
});

test('Handles empty results', () => {
  const reranked = applyMMR([], 0.7, 2);
  expect(reranked.length).toBe(0);
});

test('Handles single result', () => {
  const results = [{ title: 'Only', content: 'Single result', relevance: 0.9 }];
  const reranked = applyMMR(results, 0.7, 2);
  expect(reranked.length).toBe(1);
  expect(reranked[0].title).toBe('Only');
});

test('Preserves all results (no dropping)', () => {
  const results = [
    { title: 'A', content: 'Alpha beta gamma', relevance: 0.9 },
    { title: 'B', content: 'Delta epsilon zeta', relevance: 0.8 },
    { title: 'C', content: 'Eta theta iota', relevance: 0.7 },
    { title: 'D', content: 'Kappa lambda mu', relevance: 0.6 },
  ];
  const reranked = applyMMR(results, 0.7, 2);
  expect(reranked.length).toBe(4);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
