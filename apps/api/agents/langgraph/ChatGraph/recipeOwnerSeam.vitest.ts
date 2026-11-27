import { getSystemAgent } from '@gruenerator/shared/agents';
import { describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * Seit 11/2026 stehen Rezepte vor den Agenten, denen sie gehören (#6005, #6122).
 * Auf dem Standard-Agenten bringt ein Rezept deshalb mit, was sein Agent dem
 * Turn gab: Filter, Werkzeug-Grenzen und Notebooks. Die Übertragungs-Rezepte
 * (Einfache/Leichte Sprache) übernehmen den ganzen Pipeline-Agenten — ihr Turn
 * ist eine Kette mit getrennten Kontexten, die kein Rezept-Text ausdrückt.
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

describe('initializeChatState — Rezept vor seinem Agenten', () => {
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

  it('ein Rezept bringt die Notebooks seines Agenten mit, nicht nur im Landesverband', async () => {
    const state = await initializeChatState({
      ...base,
      agentId: 'gruenerator-universal',
      activeSkillMention: 'wahlpruefstein',
    });
    expect(state.agentConfig.identifier).toBe('gruenerator-universal');
    // Dieselben Sammlungen wie über den Agenten selbst — auch dasselbe Gate
    // für implizit durchsuchbare Notebooks.
    const viaAgent = await initializeChatState({ ...base, agentId: 'gruenerator-wahlpruefsteine' });
    expect(viaAgent.defaultNotebookCollectionIds).toContain('bundestagsfraktion');
    expect(state.defaultNotebookCollectionIds).toEqual(viaAgent.defaultNotebookCollectionIds);
  });

  it('ein Agent ohne Notebooks gibt seinem Rezept keine mit', async () => {
    const state = await initializeChatState({
      ...base,
      agentId: 'gruenerator-universal',
      activeSkillMention: 'bundestagsrecherche',
    });
    expect(state.defaultNotebookCollectionIds ?? []).toEqual([]);
  });
});
