import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Der Rollen-Chat rendert den Produktwissen-Block nie (die Persona ersetzt die
 * ganze Grünerator-Identität). Gebaut wurde er trotzdem — samt DB-Abfragen für
 * versteckte Agenten und verbundene MCP-Server. Der Test hängt am Aufruf, nicht
 * am Prompt: der Prompt war schon vorher richtig.
 */

const buildProductKnowledgeBlock = vi.fn(async () => '\n\n## PRODUKTWISSEN\n');

vi.mock('../../../../services/chat/productKnowledge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/chat/productKnowledge.js')>()),
  buildProductKnowledgeBlock,
}));
vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'greeting',
    messages: [{ role: 'user', content: 'Was kannst du?' }],
    searchResults: [],
    citations: [],
    agentConfig: { identifier: 'gruenerator-universal', systemRole: 'Du bist der Grünerator.' },
    enabledTools: {},
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    threadArtifacts: [],
    lastToolContext: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('Produktwissen-Block im Rollen-Chat', () => {
  beforeEach(() => buildProductKnowledgeBlock.mockClear());

  it('baut den Block im Standard-Chat auf eine Produkt-Metafrage', async () => {
    const prompt = await buildSystemMessage(state());

    expect(buildProductKnowledgeBlock).toHaveBeenCalledTimes(1);
    expect(prompt).toContain('## PRODUKTWISSEN');
  });

  it('baut ihn im Rollen-Chat gar nicht erst', async () => {
    const prompt = await buildSystemMessage(
      state({ customSystemPrompt: 'Du bist ein*e Übersetzer*in.' })
    );

    expect(buildProductKnowledgeBlock).not.toHaveBeenCalled();
    expect(prompt).not.toContain('## PRODUKTWISSEN');
  });
});
