import { getSystemAgent, LANDESVERBAENDE } from '@gruenerator/shared/agents';
import { describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * Seit 11/2026 stehen die LV-Rezepte vor den LV-Agenten: Hub und Seitenleiste
 * öffnen `/chat?rezept=<lv-rezept>` auf dem Universal-Agenten. Damit das so gut
 * sucht wie der Agent, bringt ein LV-Rezept das Notebook seines Landesverbands
 * mit — ebenso ein Projekt mit gesetztem Landesverband. Beide Wege laufen durch
 * dasselbe Tor wie Agent- und Projekt-Notebooks (`isNotebookImplicitlySearchable`).
 */

vi.mock('../../../routes/chat/agents/agentLoader.js', () => ({
  getAgent: async (id: string) =>
    id === 'gruenerator-universal' ? UNIVERSAL : (getSystemAgent(id) as AgentConfig | null),
  getAgentForUser: async () => UNIVERSAL,
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
const { resolveNotebookCollections } = await import('../../../config/notebookCollectionMap.js');

const base = { messages: [], agentId: 'gruenerator-universal', userId: 'u1', enabledTools: {} };

describe('initializeChatState — Landesverbands-Rezepte und -Projekte', () => {
  it('ein LV-Rezept bindet das Notebook seines Landesverbands', async () => {
    const state = await initializeChatState({
      ...base,
      activeSkillMention: 'presse-bayern-partei',
    });
    const bayern = resolveNotebookCollections(['bayern-notebook']);
    expect(bayern.length).toBeGreaterThan(0);
    expect(state.defaultNotebookCollectionIds).toEqual(expect.arrayContaining(bayern));
  });

  it('auch die neuen Wahlprüfstein-Rezepte', async () => {
    const state = await initializeChatState({
      ...base,
      activeSkillMention: 'wahlpruefstein-berlin',
    });
    expect(state.defaultNotebookCollectionIds).toEqual(
      expect.arrayContaining(resolveNotebookCollections(['berlin-notebook']))
    );
  });

  it('ein allgemeines Rezept bindet kein Notebook', async () => {
    const state = await initializeChatState({ ...base, activeSkillMention: 'presse' });
    expect(state.defaultNotebookCollectionIds ?? []).toEqual([]);
  });

  it('ein Projekt mit Landesverband bindet dessen Notebook', async () => {
    const state = await initializeChatState({ ...base, projectLandesverband: 'hessen' });
    expect(state.defaultNotebookCollectionIds).toEqual(
      expect.arrayContaining(resolveNotebookCollections(['hessen-notebook']))
    );
  });

  it('ein abgeschaltetes LV-Notebook kommt auch über das Projekt nicht herein', async () => {
    const sh = LANDESVERBAENDE.find((lv) => lv.id === 'schleswig-holstein');
    expect(sh).toBeDefined();
    const state = await initializeChatState({
      ...base,
      projectLandesverband: 'schleswig-holstein',
    });
    for (const collection of resolveNotebookCollections([sh?.notebookId ?? ''])) {
      expect(state.defaultNotebookCollectionIds ?? []).not.toContain(collection);
    }
  });
});
