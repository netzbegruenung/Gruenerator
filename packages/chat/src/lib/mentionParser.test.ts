/**
 * Tests for mentionParser — unresolvedMentions tracking
 *
 * Run with: npx tsx packages/chat/src/lib/mentionParser.test.ts
 */

import { parseAllMentions } from './mentionParser';
import { setBoardMentionables, setDocMentionables } from './mentionables';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  \u2717 ${name}: ${err.message}`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toContain(expected: string) {
      if (!Array.isArray(actual) || !actual.includes(expected))
        throw new Error(`Expected array to contain "${expected}", got ${JSON.stringify(actual)}`);
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected)
        throw new Error(
          `Expected length ${expected}, got ${Array.isArray(actual) ? actual.length : 'not an array'}`
        );
    },
  };
}

// Set up some known mentionables
setBoardMentionables([
  { id: 'board-abc', title: 'Kampagnenplan Berlin', slug: 'kampagnenplan-berlin' },
]);
setDocMentionables([{ id: 'doc-xyz', title: 'Pressespiegel', slug: 'pressespiegel' }]);

console.log('\n--- mentionParser: unresolvedMentions ---\n');

test('known board mention resolves correctly', () => {
  const result = parseAllMentions('@kampagnenplan-berlin was steht hier?');
  expect(result.boardIds).toContain('board-abc');
  expect(result.unresolvedMentions).toHaveLength(0);
});

test('known doc mention resolves correctly', () => {
  const result = parseAllMentions('@pressespiegel fasse zusammen');
  expect(result.docMentionIds).toContain('doc-xyz');
  expect(result.unresolvedMentions).toHaveLength(0);
});

test('unknown @mention tracked as unresolved', () => {
  const result = parseAllMentions('@pressespiegel-lokal-13-03-26 schreib einen Tweet');
  expect(result.unresolvedMentions).toContain('pressespiegel-lokal-13-03-26');
  expect(result.boardIds).toHaveLength(0);
  expect(result.docMentionIds).toHaveLength(0);
});

test('multiple unknown mentions all tracked', () => {
  const result = parseAllMentions('@unknown-board @another-doc do something');
  expect(result.unresolvedMentions).toHaveLength(2);
  expect(result.unresolvedMentions).toContain('unknown-board');
  expect(result.unresolvedMentions).toContain('another-doc');
});

test('unresolved / mention NOT tracked (only @ mentions)', () => {
  const result = parseAllMentions('/nonexistent-skill do something');
  expect(result.unresolvedMentions).toHaveLength(0);
});

test('mix of resolved and unresolved mentions', () => {
  const result = parseAllMentions('@kampagnenplan-berlin @nonexistent-doc vereinfache');
  expect(result.boardIds).toContain('board-abc');
  expect(result.unresolvedMentions).toContain('nonexistent-doc');
  expect(result.unresolvedMentions).toHaveLength(1);
});

test('@datei trigger NOT tracked as unresolved', () => {
  const result = parseAllMentions('@datei show picker');
  expect(result.unresolvedMentions).toHaveLength(0);
});

test('@dokumentchat trigger NOT tracked as unresolved', () => {
  const result = parseAllMentions('@dokumentchat search docs');
  expect(result.unresolvedMentions).toHaveLength(0);
  expect(result.hasDocumentChat).toBe(true);
});

test('@datei:slug NOT tracked as unresolved even when slug unknown', () => {
  const result = parseAllMentions('@datei:unknown-slug do something');
  expect(result.unresolvedMentions).toHaveLength(0);
});

test('@docs trigger resolves to docs-picker-trigger (not unresolved)', () => {
  const result = parseAllMentions('@docs browse documents');
  // @docs is registered as docs-picker-trigger in docToolMentionables
  expect(result.unresolvedMentions).toHaveLength(0);
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
