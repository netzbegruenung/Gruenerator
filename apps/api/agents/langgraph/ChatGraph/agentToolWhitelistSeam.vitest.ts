import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * #3299 — a custom agent's `enabledTools` ARRAY never reached the boolean
 * gates. This pins the seam: `initializeChatState` narrows the request record
 * for a user-created agent and leaves a system agent's record untouched.
 */

const agents = vi.hoisted(() => new Map<string, AgentConfig>());

vi.mock('../../../routes/chat/agents/agentLoader.js', () => ({
  getAgent: async (id: string) => agents.get(id),
  getAgentForUser: async (id: string) => agents.get(id),
  getDefaultAgentId: () => 'gruenerator-universal',
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { initializeChatState } = await import('./ChatGraph.js');

function agent(partial: Partial<AgentConfig>): AgentConfig {
  return {
    identifier: 'x',
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
    ...partial,
  };
}

describe('initializeChatState — agent enabledTools whitelist (#3299)', () => {
  beforeEach(() => {
    agents.clear();
    agents.set(
      'my-agent',
      agent({ identifier: 'my-agent', isUserAgent: true, enabledTools: ['search', 'web'] })
    );
    agents.set(
      'gruenerator-antrag',
      agent({ identifier: 'gruenerator-antrag', enabledTools: ['search', 'memory'] })
    );
  });

  it('closes every picker key a user agent did not choose', async () => {
    const state = await initializeChatState({
      messages: [],
      agentId: 'my-agent',
      userId: 'u1',
      enabledTools: { search: true, web: true, image: true },
    });
    expect(state.enabledTools.search).toBe(true);
    expect(state.enabledTools.web).toBe(true);
    expect(state.enabledTools.image).toBe(false);
    expect(state.enabledTools.pdf_form).toBe(false);
    expect(state.enabledTools.cloud_files).toBe(false);
    expect(state.enabledTools.search_threads).toBe(false);
    expect(state.enabledTools.research).toBeUndefined();
    expect(state.agentConfig.isUserAgent).toBe(true);
  });

  it('leaves a system agent record untouched — their arrays are not whitelisted', async () => {
    const state = await initializeChatState({
      messages: [],
      agentId: 'gruenerator-antrag',
      userId: 'u1',
      enabledTools: { search: true, web: true, image: true },
    });
    expect(state.enabledTools.image).toBe(true);
    expect(state.enabledTools.pdf_form).toBeUndefined();
  });

  it('lets a composer false survive for a key the agent allows', async () => {
    const state = await initializeChatState({
      messages: [],
      agentId: 'my-agent',
      userId: 'u1',
      enabledTools: { web: false },
    });
    expect(state.enabledTools.web).toBe(false);
  });

  it('applies the whitelist to the defaults when the request sends no record', async () => {
    agents.set(
      'my-agent',
      agent({ identifier: 'my-agent', isUserAgent: true, enabledTools: ['search'] })
    );
    const state = await initializeChatState({ messages: [], agentId: 'my-agent', userId: 'u1' });
    expect(state.enabledTools.search).toBe(true);
    expect(state.enabledTools.person).toBe(true);
    expect(state.enabledTools.web).toBe(false);
    expect(state.enabledTools.research).toBe(false);
    expect(state.enabledTools.examples).toBe(false);
    expect(state.enabledTools.image).toBe(false);
  });
});
