import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from './chatStore';

/**
 * Was `setCurrentThread` mit Skill-Mention und angeheftetem Konnektor macht.
 *
 * Der erste Send eines neuen Chats LEGT den Thread an (lazy initialize bzw.
 * `onThreadCreated` aus dem SSE-Stream) — beide münden in
 * `setCurrentThread(neueId)`. Das ist eine Fortsetzung desselben Gesprächs,
 * kein Wechsel: Ein auf der Startseite angehefteter Konnektor starb hier mit
 * dem ersten gestreamten Antwort-Event, der Chip verschwand aus dem Chat und
 * jede Folgefrage verlor ihren MCP-Scope. Dasselbe traf das gewählte Rezept
 * (`activeSkillMention`) — der Fall, den es schon einmal bei den handgetippten
 * /skill-Mentions gab.
 */

const PINNED = { id: 'system-gesetze', label: 'Gesetze' };

beforeEach(() => {
  useAgentStore.setState({
    currentThreadId: null,
    pinnedConnector: { ...PINNED },
    activeSkillMention: 'presse',
    messageCount: 5,
  });
});

describe('setCurrentThread', () => {
  it('behält Konnektor und Rezept, wenn der Entwurf zum Thread wird', () => {
    useAgentStore.getState().setCurrentThread('thread-neu');

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toEqual(PINNED);
    expect(state.activeSkillMention).toBe('presse');
  });

  it('setzt den restlichen Thread-Zustand beim Anlegen trotzdem zurück', () => {
    useAgentStore.getState().setCurrentThread('thread-neu');

    const state = useAgentStore.getState();
    expect(state.currentThreadId).toBe('thread-neu');
    expect(state.messageCount).toBe(0);
    expect(state.currentThreadTitle).toBeNull();
  });

  it('räumt beide beim Wechsel in einen ANDEREN Thread ab', () => {
    useAgentStore.setState({ currentThreadId: 'thread-alt' });

    useAgentStore.getState().setCurrentThread('thread-anderer');

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toBeNull();
    expect(state.activeSkillMention).toBeNull();
  });

  it('räumt beide beim Verlassen in den Entwurf ab (neuer Chat)', () => {
    useAgentStore.setState({ currentThreadId: 'thread-alt' });

    useAgentStore.getState().setCurrentThread(null);

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toBeNull();
    expect(state.activeSkillMention).toBeNull();
  });
});
