/**
 * Tests for CitationGrounder
 * Run with: npx tsx apps/api/services/search/CitationGrounder.test.ts
 */

import { validateCitations, stripUngroundedCitations } from './CitationGrounder.js';

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
    toContain(expected: any) {
      if (!actual.includes(expected)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
    },
    toNotContain(expected: any) {
      if (actual.includes(expected)) throw new Error(`Expected ${JSON.stringify(actual)} to NOT contain ${JSON.stringify(expected)}`);
    },
  };
}

console.log('CitationGrounder Tests');
console.log('======================');

test('Validates grounded citations', () => {
  const text = 'Die Grünen setzen sich für Klimaschutz und Umweltpolitik ein [1]. Die Energiewende ist ein zentrales Thema [2].';
  const sources = [
    { id: 1, content: 'Die Grünen Partei setzt sich für Klimaschutz und nachhaltige Umweltpolitik in Deutschland ein.' },
    { id: 2, content: 'Die Energiewende ist ein zentrales Thema der grünen Politik. Erneuerbare Energien stehen im Fokus.' },
  ];

  const result = validateCitations(text, sources);
  expect(result.groundedCitations.length).toBe(2);
  expect(result.ungroundedCitations.length).toBe(0);
  expect(result.confidence).toBe(1);
});

test('Detects ungrounded citation (no overlap)', () => {
  const text = 'Die Wirtschaft wächst stark [1]. Basketballstadien wachsen rasant weltweit [2].';
  const sources = [
    { id: 1, content: 'Die Wirtschaft wächst stark im dritten Quartal laut aktuellen Berichten über Konjunktur.' },
    { id: 2, content: 'Klimaschutz und Umweltpolitik sind zentrale Themen der Grünen Partei Deutschland.' },
  ];

  const result = validateCitations(text, sources);
  expect(result.groundedCitations).toContain(1);
  expect(result.ungroundedCitations).toContain(2);
});

test('Detects citation to non-existent source', () => {
  const text = 'Wichtige Information [5].';
  const sources = [
    { id: 1, content: 'Erste Quelle mit Informationen.' },
  ];

  const result = validateCitations(text, sources);
  expect(result.ungroundedCitations).toContain(5);
});

test('Handles text with no citations', () => {
  const text = 'Ein Text ohne Zitate.';
  const sources = [{ id: 1, content: 'Quellentext.' }];

  const result = validateCitations(text, sources);
  expect(result.totalCitations).toBe(0);
  expect(result.confidence).toBe(1);
});

test('stripUngroundedCitations removes markers', () => {
  const text = 'Statement A [1]. Statement B [2]. Statement C [3].';
  const cleaned = stripUngroundedCitations(text, [2]);
  expect(cleaned).toContain('[1]');
  expect(cleaned).toNotContain('[2]');
  expect(cleaned).toContain('[3]');
});

test('Handles multiple citations of same source', () => {
  const text = 'First point [1]. Second point [1]. Third point [2].';
  const sources = [
    { id: 1, content: 'First relevant point and second important information in this source document.' },
    { id: 2, content: 'Third topic covered here with different subject matter entirely.' },
  ];

  const result = validateCitations(text, sources);
  // [1] appears twice but should only be counted once
  expect(result.totalCitations).toBe(2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
