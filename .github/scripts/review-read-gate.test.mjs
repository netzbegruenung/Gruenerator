// node --test .github/scripts/review-read-gate.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTRA, openedFiles, windows } from './review-read-gate.mjs';

const WS = '/home/runner/work/Gruenerator/Gruenerator';

// 40 Zeilen; Zeile 20 wurde geändert, also Hunk +17,7 (drei Kontextzeilen).
const FILE = 'apps/web/src/a.ts';
const HEAD = Array.from({ length: 40 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');
const PATCH = [
  '@@ -17,7 +17,7 @@',
  ...[17, 18, 19].map((n) => ` const line${n} = ${n};`),
  '-const line20 = 0;',
  '+const line20 = 20;',
  ...[21, 22, 23].map((n) => ` const line${n} = ${n};`),
].join('\n');
const PATCHES = [{ file: FILE, patch: PATCH, deletions: 1 }];
const headText = (f) => (f === FILE ? HEAD : null);

const lines = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `const line${from + i} = ${from + i};`);

function run(calls) {
  const execution = [];
  for (const [name, input, output] of calls) {
    execution.push({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name, input }] },
    });
    execution.push({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: output }] },
    });
  }
  return openedFiles(execution, PATCHES, headText, WS);
}

const numbered = (from, to, sep) =>
  lines(from, to)
    .map((l, i) => `${from + i}${sep}${l}`)
    .join('\n');

test('windows: hunk plus EXTRA on both sides, clipped and merged', () => {
  assert.deepEqual(windows(PATCH, 40), [[17 - EXTRA, 23 + EXTRA]]);
  assert.deepEqual(windows('@@ -1,2 +1,3 @@\n@@ -9 +10 @@', 12), [[1, 12]]);
  // Reiner Lösch-Hunk hinter Zeile 30.
  assert.deepEqual(windows('@@ -31,2 +30,0 @@', 40), [[31 - EXTRA, 30 + EXTRA]]);
});

test('a full Read counts, in both line-number formats', () => {
  assert.deepEqual(run([['Read', { file_path: `${WS}/${FILE}` }, numbered(1, 40, '\t')]]), [FILE]);
  assert.deepEqual(
    run([['Read', { file_path: `${WS}/${FILE}` }, numbered(1, 40, '→').replace(/^/gm, '     ')]]),
    [FILE]
  );
});

test('cat, sed -n over the window, and git log -p count (#4854)', () => {
  assert.deepEqual(run([['Bash', { command: `cat ${FILE}` }, HEAD]]), [FILE]);
  assert.deepEqual(run([['Bash', { command: `sed -n 5,35p ${FILE}` }, lines(5, 35).join('\n')]]), [
    FILE,
  ]);
  const logP = ['commit abc', `+++ b/${FILE}`, ...lines(1, 40).map((l) => `+${l}`)].join('\n');
  assert.deepEqual(run([['Bash', { command: `git log -p -- ${FILE}` }, logP]]), [FILE]);
});

test('grep -n with enough context counts', () => {
  const out = lines(10, 30)
    .map((l, i) => `${FILE}${i === 10 ? ':' : '-'}${10 + i}${i === 10 ? ':' : '-'}${l}`)
    .join('\n');
  assert.deepEqual(run([['Grep', { pattern: 'line20', output_mode: 'content' }, out]]), [FILE]);
});

test('a Read in two chunks counts', () => {
  assert.deepEqual(
    run([
      ['Read', { file_path: `${WS}/${FILE}`, limit: 20 }, numbered(1, 20, '\t')],
      ['Read', { file_path: `${WS}/${FILE}`, offset: 21 }, numbered(21, 40, '\t')],
    ]),
    [FILE]
  );
});

test('a peek that misses the changed region does not count', () => {
  assert.deepEqual(
    run([['Read', { file_path: `${WS}/${FILE}`, offset: 30, limit: 10 }, numbered(30, 40, '\t')]]),
    []
  );
  assert.deepEqual(
    run([['Bash', { command: `sed -n 18,22p ${FILE}` }, lines(18, 22).join('\n')]]),
    []
  );
});

test('the diff alone does not count for a file with deletions', () => {
  const diff = [`diff --git a/${FILE} b/${FILE}`, `+++ b/${FILE}`, PATCH].join('\n');
  assert.deepEqual(run([['Bash', { command: 'gh pr diff 1' }, diff]]), []);
});

test('pure additions count from a complete diff, not from a truncated one (#4839)', () => {
  const added = ['+it("a", () => {', '+  expect(1).toBe(1);', '+});'];
  const patch = ['@@ -40,0 +41,3 @@', ...added].join('\n');
  const execution = (out) => [
    { type: 'user', message: { content: [{ type: 'tool_result', content: out }] } },
  ];
  const patches = [{ file: FILE, patch, deletions: 0 }];
  assert.deepEqual(
    openedFiles(execution(added.join('\n')), patches, () => null, WS),
    [FILE]
  );
  assert.deepEqual(
    openedFiles(execution(added.slice(0, 2).join('\n')), patches, () => null, WS),
    []
  );
});

test('without a patch only a Read on that exact file counts', () => {
  const patches = [{ file: 'img.png', patch: null, deletions: 0 }];
  const execution = [
    {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: `${WS}/img.png` } }],
      },
    },
  ];
  assert.deepEqual(
    openedFiles(execution, patches, () => null, WS),
    ['img.png']
  );
  assert.deepEqual(
    openedFiles([], patches, () => null, WS),
    []
  );
});
