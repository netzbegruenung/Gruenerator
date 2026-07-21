/**
 * Tests for GrueneratorModelAdapter pure utils — truncateAttachmentContext + buildRequestBody.
 */

import { describe, expect, it } from 'vitest';

import {
  buildRequestBody,
  isAuiInternalThreadId,
  resolveRuntimeThreadId,
  type BuildRequestBodyParams,
} from './buildRequestBody';
import { truncateAttachmentContext } from './truncation';

describe('isAuiInternalThreadId', () => {
  it('flags the legacy local sentinel', () => {
    expect(isAuiInternalThreadId('__DEFAULT_ID__')).toBe(true);
  });

  it('flags initialized local threads (aui 0.14.2x remote-thread-list machinery)', () => {
    // These override the surface-resolved threadId if let through: the backend
    // drops the non-UUID (new thread per message) and the context-provider
    // lookup misses (currentDocument never sent) — the sheets-editor bug.
    expect(isAuiInternalThreadId('__LOCALID_abc123')).toBe(true);
  });

  it('passes real server thread ids through', () => {
    expect(isAuiInternalThreadId('0833dc5b-b852-41a8-8177-e8501c49e739')).toBe(false);
  });

  it('treats missing ids as non-internal (no override either way)', () => {
    expect(isAuiInternalThreadId(undefined)).toBe(false);
    expect(isAuiInternalThreadId('')).toBe(false);
  });
});

describe('resolveRuntimeThreadId', () => {
  const uuid = '0833dc5b-b852-41a8-8177-e8501c49e739';

  it('pinned surfaces never consult the runtime id', () => {
    expect(resolveRuntimeThreadId('pinned', uuid)).toBe(null);
    expect(resolveRuntimeThreadId('pinned', '__LOCALID_x')).toBe(null);
  });

  it('runtime binding uses real per-run ids (thread-switch race protection)', () => {
    expect(resolveRuntimeThreadId('runtime', uuid)).toBe(uuid);
  });

  it('runtime binding filters aui-internal sentinels', () => {
    expect(resolveRuntimeThreadId('runtime', '__DEFAULT_ID__')).toBe(null);
    expect(resolveRuntimeThreadId('runtime', '__LOCALID_abc')).toBe(null);
    expect(resolveRuntimeThreadId('runtime', undefined)).toBe(null);
  });
});

describe('truncateAttachmentContext', () => {
  it('empty input → undefined', () => {
    expect(truncateAttachmentContext('', 100)).toBe(undefined);
  });

  it('text shorter than max is returned unchanged', () => {
    expect(truncateAttachmentContext('hello', 100)).toBe('hello');
  });

  it('text equal to max is returned unchanged', () => {
    const s = 'x'.repeat(50);
    expect(truncateAttachmentContext(s, 50)).toBe(s);
  });

  it('long text is truncated with marker and head/tail halves', () => {
    const s = 'A'.repeat(100) + 'B'.repeat(100);
    const out = truncateAttachmentContext(s, 80)!;
    expect(out.includes('[...gekürzt...]')).toBe(true);
    expect(out.length < s.length).toBe(true);
    expect(out.startsWith('A')).toBe(true);
    expect(out.endsWith('B')).toBe(true);
  });
});

describe('buildRequestBody', () => {
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
    sheetIds: [],
    docMentionIds: [],
    wolkeFiles: [],
    connectFiles: [],
    mergedDocChatIds: [],
    hasDocumentChat: false,
    injectedCurrentDocument: undefined,
    injectedCurrentBoard: undefined,
    injectedAttachmentContext: undefined,
    seededInitialAssistantMessage: undefined,
    currentSharepic: null,
    currentSocialPost: null,
    currentReel: null,
    reelUpload: null,
    webpageUrls: [],
    regenerate: false,
    replaceFromMessageId: undefined,
    ...overrides,
  });

  it('search mode → query + searchMode, no enabledTools', () => {
    const body = buildRequestBody(baseParams({ effectiveMode: 'search' }));
    expect(body.query).toBe('hallo');
    expect(body.searchMode).toBe('web');
    expect(body.agentId).toBe('agent-x');
    expect('enabledTools' in body).toBe(false);
  });

  it('notebook mode → messages + collectionId fallback from selectedNotebookId', () => {
    const body = buildRequestBody(baseParams({ effectiveMode: 'notebook' }));
    expect(body.messages).toBeDefined();
    expect(body.collectionId).toBe('nb-1');
    expect(body.mode).toBe('fast');
    expect('notebookId' in body).toBe(false);
    expect('query' in body).toBe(false);
  });

  it('notebook mode → resolved collectionIds take precedence over the fallback', () => {
    const body = buildRequestBody(
      baseParams({
        effectiveMode: 'notebook',
        config: { ...baseConfig, selectedNotebookCollectionIds: ['grundsatz-system'] },
      })
    );
    expect(body.collectionIds).toEqual(['grundsatz-system']);
    expect('collectionId' in body).toBe(false);
  });

  it('chat mode → agentId = effectiveAgentId, carries modelId', () => {
    const body = buildRequestBody(
      baseParams({ effectiveMode: 'chat', effectiveAgentId: 'mentioned' })
    );
    expect(body.agentId).toBe('mentioned');
    expect(body.modelId).toBe('model-x');
    expect('roleName' in body).toBe(false);
  });

  it('eigener mode → agentId null + roleName included', () => {
    const body = buildRequestBody(baseParams({ effectiveMode: 'eigener' }));
    expect(body.agentId).toBe(null);
    expect(body.roleName).toBe('role');
  });

  it('empty arrays collapse to undefined fields', () => {
    const body = buildRequestBody(baseParams({ effectiveMode: 'chat' }));
    expect(body.notebookIds).toBe(undefined);
    expect(body.attachments).toBe(undefined);
  });

  it('non-empty notebookIds are forwarded', () => {
    const body = buildRequestBody(baseParams({ effectiveMode: 'chat', notebookIds: ['nb-a'] }));
    expect(body.notebookIds).toEqual(['nb-a']);
  });
});
