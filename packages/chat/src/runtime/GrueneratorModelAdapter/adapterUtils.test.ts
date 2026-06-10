/**
 * Tests for GrueneratorModelAdapter pure utils — truncateAttachmentContext + buildRequestBody.
 *
 * Run with: npx tsx packages/chat/src/runtime/GrueneratorModelAdapter/adapterUtils.test.ts
 */

import { buildRequestBody, type BuildRequestBodyParams } from './buildRequestBody';
import { truncateAttachmentContext } from './truncation';

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
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
  };
}

// ── truncateAttachmentContext ──

test('empty input → undefined', () => {
  expect(truncateAttachmentContext('', 100)).toBe(undefined);
});

test('text shorter than max is returned unchanged', () => {
  expect(truncateAttachmentContext('hello', 100)).toBe('hello');
});

test('text equal to max is returned unchanged', () => {
  const s = 'x'.repeat(50);
  expect(truncateAttachmentContext(s, 50)).toBe(s);
});

test('long text is truncated with marker and head/tail halves', () => {
  const s = 'A'.repeat(100) + 'B'.repeat(100);
  const out = truncateAttachmentContext(s, 80)!;
  if (!out.includes('[...gekürzt...]')) throw new Error('missing marker');
  if (out.length >= s.length) throw new Error('not shortened');
  // head starts with A, tail ends with B
  expect(out.startsWith('A')).toBe(true);
  expect(out.endsWith('B')).toBe(true);
});

// ── buildRequestBody ──

const baseConfig = {
  agentId: 'agent-x',
  modelId: 'model-x',
  enabledTools: { search: true } as any,
  threadId: 'thread-1',
  selectedNotebookId: 'nb-1',
  searchMode: 'web' as const,
  customSystemPrompt: 'sys',
  customRoleName: 'role',
  customEnabledTools: null,
  activeSkillMention: null,
};

const baseParams = (overrides: Partial<BuildRequestBodyParams>): BuildRequestBodyParams => ({
  effectiveMode: 'chat',
  formattedMessages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hallo' }] }],
  config: baseConfig,
  effectiveAgentId: 'agent-x',
  safeCustomEnabledTools: null,
  extractedAttachments: [],
  notebookIds: [],
  forcedTools: [],
  documentIds: [],
  textIds: [],
  boardIds: [],
  docMentionIds: [],
  wolkeFiles: [],
  connectFiles: [],
  mergedDocChatIds: [],
  hasDocumentChat: false,
  injectedCurrentDocument: undefined,
  injectedAttachmentContext: undefined,
  seededInitialAssistantMessage: undefined,
  currentSharepic: null,
  ...overrides,
});

test('search mode → query + searchMode, no enabledTools', () => {
  const body = buildRequestBody(baseParams({ effectiveMode: 'search' }));
  expect(body.query).toBe('hallo');
  expect(body.searchMode).toBe('web');
  expect(body.agentId).toBe('agent-x');
  expect('enabledTools' in body).toBe(false);
});

test('notebook mode → notebookId from selectedNotebookId', () => {
  const body = buildRequestBody(baseParams({ effectiveMode: 'notebook' }));
  expect(body.notebookId).toBe('nb-1');
  expect(body.query).toBe('hallo');
  expect('messages' in body).toBe(false);
});

test('chat mode → agentId = effectiveAgentId, carries modelId', () => {
  const body = buildRequestBody(
    baseParams({ effectiveMode: 'chat', effectiveAgentId: 'mentioned' })
  );
  expect(body.agentId).toBe('mentioned');
  expect(body.modelId).toBe('model-x');
  expect('roleName' in body).toBe(false);
});

test('eigener mode → agentId null + roleName included', () => {
  const body = buildRequestBody(baseParams({ effectiveMode: 'eigener' }));
  expect(body.agentId).toBe(null);
  expect(body.roleName).toBe('role');
});

test('empty arrays collapse to undefined fields', () => {
  const body = buildRequestBody(baseParams({ effectiveMode: 'chat' }));
  expect(body.notebookIds).toBe(undefined);
  expect(body.attachments).toBe(undefined);
});

test('non-empty notebookIds are forwarded', () => {
  const body = buildRequestBody(baseParams({ effectiveMode: 'chat', notebookIds: ['nb-a'] }));
  expect(body.notebookIds).toEqual(['nb-a']);
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
