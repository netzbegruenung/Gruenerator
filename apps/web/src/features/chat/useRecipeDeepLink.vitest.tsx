/**
 * Der Deeplink `/chat?rezept=…` muss das Rezept auch dann noch tragen, wenn
 * `AgentSwitchListener` einen Commit später `resetThreadContext()` ruft — das
 * ist genau der Fall, in dem ein Systemrezept (`?rezept=presse`) seinen Stil
 * bisher verlor. Deshalb wird hier gegen den echten Store geprüft: setzen,
 * abräumen lassen, und darauf bestehen, dass der Hook nachträgt.
 */
import { useAgentStore } from '@gruenerator/chat';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useRecipeDeepLink } from './useRecipeDeepLink';

beforeEach(() => {
  useAgentStore.getState().setActiveSkillMention(null, null);
});

describe('useRecipeDeepLink', () => {
  it('trägt Erwähnung und Zeilen-ID in den Store', () => {
    renderHook(() => useRecipeDeepLink('mein-rezept', 'row-1'));

    expect(useAgentStore.getState().activeSkillMention).toBe('mein-rezept');
    expect(useAgentStore.getState().activeRecipeId).toBe('row-1');
  });

  it('trägt das Rezept nach, wenn resetThreadContext es abräumt', () => {
    renderHook(() => useRecipeDeepLink('presse', null));
    expect(useAgentStore.getState().activeSkillMention).toBe('presse');

    act(() => {
      useAgentStore.getState().resetThreadContext();
    });

    expect(useAgentStore.getState().activeSkillMention).toBe('presse');
    expect(useAgentStore.getState().activeRecipeId).toBeNull();
  });

  it('überschreibt eine selbst gewählte andere Erwähnung nicht', () => {
    renderHook(() => useRecipeDeepLink('presse', null));
    expect(useAgentStore.getState().activeSkillMention).toBe('presse');

    act(() => {
      useAgentStore.getState().setActiveSkillMention('antrag', null);
    });

    // Der Deeplink steht weiter in der URL — trotzdem gehört die Wahl der
    // Person, nicht dem Parameter.
    expect(useAgentStore.getState().activeSkillMention).toBe('antrag');
  });

  it('trägt sich auch nach einem Entfernen von Hand wieder ein (dokumentierte Unschärfe)', () => {
    // `removePillMention` setzt denselben `null`-Wert wie
    // `resetThreadContext()`; der Store trägt keine Herkunft. Der Hook
    // entscheidet sich für das Nachtragen — hier festgehalten, damit die
    // Entscheidung nicht unbemerkt kippt.
    renderHook(() => useRecipeDeepLink('presse', null));

    act(() => {
      useAgentStore.getState().setActiveSkillMention(null, null);
    });

    expect(useAgentStore.getState().activeSkillMention).toBe('presse');
  });

  it('rührt den Store ohne Parameter nicht an', () => {
    act(() => {
      useAgentStore.getState().setActiveSkillMention('handgetippt', null);
    });

    renderHook(() => useRecipeDeepLink(null, null));

    expect(useAgentStore.getState().activeSkillMention).toBe('handgetippt');
  });
});
