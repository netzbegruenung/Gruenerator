import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * Notebooks shared into a project are bound in `initializeChatState` exactly
 * like an agent's `defaultNotebookIds`: system slugs through the implicit gate
 * into the default collections, user notebooks through
 * `resolveUserNotebookDocumentIds` — the read-access check. Nothing reads a
 * project notebook past that check.
 */

const resolveUserNotebookDocumentIds = vi.hoisted(() => vi.fn());

vi.mock('../../../config/notebookCollectionMap.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../config/notebookCollectionMap.js')>();
  return { ...real, resolveUserNotebookDocumentIds };
});

vi.mock('../../../routes/chat/agents/agentLoader.js', () => ({
  getAgent: async () => AGENT,
  getAgentForUser: async () => AGENT,
  getDefaultAgentId: () => 'gruenerator-universal',
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const AGENT: AgentConfig = {
  identifier: 'gruenerator-universal',
  title: 'x',
  description: '',
  systemRole: 'Du bist ein Test.',
  avatar: '',
  backgroundColor: '',
  tags: [],
  model: 'm',
  provider: 'mistral',
  params: { max_tokens: 1, temperature: 0 },
  openingMessage: '',
  openingQuestions: [],
  locale: 'de-DE',
  author: '',
};

const { initializeChatState } = await import('./ChatGraph.js');
const { resolveNotebookCollections } = await import('../../../config/notebookCollectionMap.js');

const USER_NB = '11111111-1111-4111-8111-111111111111';

describe('initializeChatState — project notebooks', () => {
  beforeEach(() => {
    resolveUserNotebookDocumentIds.mockReset();
    resolveUserNotebookDocumentIds.mockResolvedValue({
      documentIds: ['doc-1'],
      resolvedUserNotebookIds: [USER_NB],
      documentNotebookIds: { 'doc-1': USER_NB },
    });
  });

  it('binds a shared system notebook as a default collection', async () => {
    const state = await initializeChatState({
      messages: [],
      agentId: 'gruenerator-universal',
      userId: 'u1',
      enabledTools: {},
      projectNotebookIds: ['bayern-notebook'],
    });
    const expected = resolveNotebookCollections(['bayern-notebook']);
    expect(expected.length).toBeGreaterThan(0);
    expect(state.defaultNotebookCollectionIds).toEqual(expect.arrayContaining(expected));
  });

  it('reads a shared user notebook only through the access check', async () => {
    const state = await initializeChatState({
      messages: [],
      agentId: 'gruenerator-universal',
      userId: 'u1',
      enabledTools: {},
      projectNotebookIds: [USER_NB],
    });
    expect(resolveUserNotebookDocumentIds).toHaveBeenCalledWith('u1', [USER_NB]);
    expect(state.defaultNotebookDocumentIds).toEqual(['doc-1']);
    expect(state.documentNotebookIds).toEqual({ 'doc-1': USER_NB });
  });

  it('adds nothing when the access check refuses the notebook', async () => {
    resolveUserNotebookDocumentIds.mockResolvedValue({
      documentIds: [],
      resolvedUserNotebookIds: [],
      documentNotebookIds: {},
    });
    const state = await initializeChatState({
      messages: [],
      agentId: 'gruenerator-universal',
      userId: 'u1',
      enabledTools: {},
      projectNotebookIds: [USER_NB],
    });
    expect(state.defaultNotebookDocumentIds).toEqual([]);
  });

  it('without a project nothing is resolved', async () => {
    await initializeChatState({
      messages: [],
      agentId: 'gruenerator-universal',
      userId: 'u1',
      enabledTools: {},
    });
    expect(resolveUserNotebookDocumentIds).not.toHaveBeenCalled();
  });
});
