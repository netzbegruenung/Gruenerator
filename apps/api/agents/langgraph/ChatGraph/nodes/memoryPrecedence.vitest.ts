/**
 * Profile text and memory instructions both reach every system prompt and can
 * contradict each other (#3586). The memory block names the winner — but only
 * when there is a profile to lose against.
 */

import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
  getTextFormForInjectionById: async () => null,
}));
vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

const PRECEDENCE = 'gilt die Anweisung aus dem Gedächtnis';

function state(overrides: Partial<ChatGraphState>): ChatGraphState {
  return {
    intent: 'produktion',
    messages: [{ role: 'user', content: 'Schreib eine Pressemitteilung zu Artenvielfalt.' }],
    searchResults: [],
    citations: [],
    agentConfig: {
      identifier: 'gruenerator-universal',
      systemRole: 'Du bist der Grünerator.',
      userId: 'u1',
    },
    enabledTools: {},
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    threadArtifacts: [],
    lastToolContext: null,
    memoryContext: '### Dauerhafte Anweisungen\nNr. 1 (01.09.2026): Ab jetzt duzen.',
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('memory over profile', () => {
  it('lets the memory win when a profile is set', async () => {
    const prompt = await buildSystemMessage(state({ userInstructions: 'Immer in der Sie-Form.' }));
    expect(prompt).toContain('## PERSÖNLICHE ANWEISUNGEN');
    expect(prompt).toContain(PRECEDENCE);
  });

  it('says nothing about precedence without a profile', async () => {
    const prompt = await buildSystemMessage(state({}));
    expect(prompt).toContain('## GEDÄCHTNIS');
    expect(prompt).not.toContain(PRECEDENCE);
  });
});
