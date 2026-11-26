import { getSystemAgent } from '@gruenerator/shared/agents';
import { describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * Seit 11/2026 stehen die Rezepte „Einfache Sprache" und „Leichte Sprache" vor
 * ihren Agenten. Ihr Turn ist eine Kette mit getrennten Kontexten, die kein
 * Rezept-Text ausdrücken kann — deshalb übernimmt der Turn auf dem
 * Standard-Agenten den ganzen Pipeline-Agenten, und Routing, Modellwahl,
 * Persona und Kette laufen wie über den Agenten selbst.
 */

vi.mock('../../../routes/chat/agents/agentLoader.js', () => ({
  getAgent: async (id: string) =>
    id === 'gruenerator-universal' ? UNIVERSAL : (getSystemAgent(id) as AgentConfig | undefined),
  getAgentForUser: async (id: string) =>
    id === 'gruenerator-universal' ? UNIVERSAL : (getSystemAgent(id) as AgentConfig | undefined),
  getDefaultAgentId: () => 'gruenerator-universal',
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const UNIVERSAL: AgentConfig = {
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

const base = { messages: [], userId: 'u1', enabledTools: {} };

describe('initializeChatState — Übertragungs-Rezepte', () => {
  it('ein Übertragungs-Rezept auf dem Standard-Agenten fährt dessen Pipeline-Agenten', async () => {
    const state = await initializeChatState({
      ...base,
      agentId: 'gruenerator-universal',
      activeSkillMention: 'leichte-sprache',
    });
    expect(state.agentConfig.identifier).toBe('gruenerator-leichte-sprache');
  });

  it('ein ausdrücklich gewählter Agent bleibt', async () => {
    const state = await initializeChatState({
      ...base,
      agentId: 'gruenerator-antrag',
      activeSkillMention: 'leichte-sprache',
    });
    expect(state.agentConfig.identifier).toBe('gruenerator-antrag');
  });

  it('ein gewöhnliches Rezept lässt den Standard-Agenten stehen', async () => {
    const state = await initializeChatState({
      ...base,
      agentId: 'gruenerator-universal',
      activeSkillMention: 'presse',
    });
    expect(state.agentConfig.identifier).toBe('gruenerator-universal');
  });
});
