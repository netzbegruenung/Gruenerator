import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentStore } from './chatStore';

/**
 * Wer Skill-Mention und angehefteten Konnektor über Thread-Übergänge trägt.
 *
 * Der erste Send eines neuen Chats LEGT den Thread an (lazy `initialize()`
 * bzw. `onThreadCreated` aus dem SSE-Stream) — diese Münz-Stellen rufen
 * `mintThreadFromDraft`: eine Fortsetzung desselben Gesprächs, kein Wechsel.
 * Vorher lief das über `setCurrentThread`, dessen pauschales Abräumen den auf
 * der Startseite angehefteten Konnektor mit dem ersten gestreamten
 * Antwort-Event tötete — Chip weg, Folgefragen ohne MCP-Scope. Dasselbe traf
 * das gewählte Rezept (bekannt vom handgetippten /skill, #2755).
 *
 * `setCurrentThread` bleibt der Navigations-Schreiber (Sidebar/URL-Sync) und
 * räumt WEITERHIN bedingungslos ab — auch bei `null → id`: Der Wechsel vom
 * verlassenen Entwurf in einen bereits existierenden Thread sieht für den
 * Store identisch aus wie das Münzen, und ein dort vergessener Pin darf nicht
 * in einen fremden Thread lecken.
 */

const PINNED = { id: 'system-gesetze', label: 'Gesetze' };

beforeEach(() => {
  useAgentStore.setState({
    currentThreadId: null,
    pinnedConnector: { ...PINNED },
    activeSkillMention: 'presse',
    activeRecipeId: 'recipe-presse-1',
    messageCount: 5,
  });
});

describe('mintThreadFromDraft', () => {
  it('behält Konnektor und Rezept (samt Rezept-Id), wenn der Entwurf zum Thread wird', () => {
    useAgentStore.getState().mintThreadFromDraft('thread-neu');

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toEqual(PINNED);
    expect(state.activeSkillMention).toBe('presse');
    expect(state.activeRecipeId).toBe('recipe-presse-1');
  });

  it('setzt den restlichen Thread-Zustand beim Münzen trotzdem zurück', () => {
    useAgentStore.getState().mintThreadFromDraft('thread-neu');

    const state = useAgentStore.getState();
    expect(state.currentThreadId).toBe('thread-neu');
    expect(state.messageCount).toBe(0);
    expect(state.currentThreadTitle).toBeNull();
  });
});

describe('setCurrentThread', () => {
  it('räumt auch bei Entwurf → existierendem Thread ab (Sidebar-Klick, kein Münzen)', () => {
    useAgentStore.getState().setCurrentThread('thread-fremd');

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toBeNull();
    expect(state.activeSkillMention).toBeNull();
    expect(state.activeRecipeId).toBeNull();
  });

  it('räumt beim Wechsel zwischen zwei Threads ab', () => {
    useAgentStore.setState({ currentThreadId: 'thread-alt' });

    useAgentStore.getState().setCurrentThread('thread-anderer');

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toBeNull();
    expect(state.activeSkillMention).toBeNull();
    expect(state.activeRecipeId).toBeNull();
  });

  it('räumt beim Verlassen in den Entwurf ab (neuer Chat)', () => {
    useAgentStore.setState({ currentThreadId: 'thread-alt' });

    useAgentStore.getState().setCurrentThread(null);

    const state = useAgentStore.getState();
    expect(state.pinnedConnector).toBeNull();
    expect(state.activeSkillMention).toBeNull();
    expect(state.activeRecipeId).toBeNull();
  });
});

describe('setActiveSkillMention', () => {
  it('setzt die Rezept-Id nur, wenn sie mitgegeben wird', () => {
    useAgentStore.getState().setActiveSkillMention('omveinladungen', 'recipe-omv-1');
    expect(useAgentStore.getState().activeRecipeId).toBe('recipe-omv-1');

    useAgentStore.getState().setActiveSkillMention('presse');
    expect(useAgentStore.getState().activeSkillMention).toBe('presse');
    expect(useAgentStore.getState().activeRecipeId).toBeNull();
  });
});

describe('setSelectedAgent / resetThreadContext / resetChatContext', () => {
  it('räumen die Rezept-Id mit der Skill-Mention gemeinsam ab', () => {
    useAgentStore.getState().setSelectedAgent('anderer-agent');
    expect(useAgentStore.getState().activeSkillMention).toBeNull();
    expect(useAgentStore.getState().activeRecipeId).toBeNull();

    useAgentStore.setState({ activeSkillMention: 'presse', activeRecipeId: 'recipe-presse-1' });
    useAgentStore.getState().resetThreadContext();
    expect(useAgentStore.getState().activeSkillMention).toBeNull();
    expect(useAgentStore.getState().activeRecipeId).toBeNull();

    useAgentStore.setState({ activeSkillMention: 'presse', activeRecipeId: 'recipe-presse-1' });
    useAgentStore.getState().resetChatContext();
    expect(useAgentStore.getState().activeSkillMention).toBeNull();
    expect(useAgentStore.getState().activeRecipeId).toBeNull();
  });
});
