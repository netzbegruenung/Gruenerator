import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hintergrundläufe (wiederkehrende Aufgaben, Board-Agents) bauen ihren Zustand
 * ohne `streamContext`. Die dokumentgebundene Suche liest die Person aus
 * `agentConfig.userId` — fehlt sie, bricht der Vorab-Abruf der Projektdateien
 * mit „User ID must be a non-empty string" ab (live 22.11.2026, Aufgabe im
 * Projekt antwortete „keine Informationen").
 */
const initializeChatState = vi.fn();
vi.mock('../../../agents/langgraph/ChatGraph/ChatGraph.js', () => ({
  initializeChatState: (...args: unknown[]) => initializeChatState(...args),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/classifierNode.js', () => ({
  classifierNode: vi.fn(async () => ({})),
}));

const { prepareAgentState } = await import('./generate.js');

beforeEach(() => {
  initializeChatState.mockReset();
  initializeChatState.mockImplementation(async () => ({ agentConfig: {} }));
});

describe('prepareAgentState', () => {
  it('stamps the run owner onto agentConfig, like the request path', async () => {
    const { finalState } = await prepareAgentState('Fasse zusammen.', 'de-DE', {
      agentId: '',
      userId: 'user-1',
    });
    expect(finalState.agentConfig.userId).toBe('user-1');
  });

  it('leaves agentConfig alone without a user', async () => {
    const { finalState } = await prepareAgentState('Fasse zusammen.', 'de-DE');
    expect(finalState.agentConfig.userId).toBeUndefined();
  });
});
