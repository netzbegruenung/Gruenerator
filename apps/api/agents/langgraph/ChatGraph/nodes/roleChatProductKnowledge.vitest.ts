import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Der Rollen-Chat ersetzt die Grünerator-IDENTITÄT, nicht das Produktwissen:
 * auf eine Produktfrage bekommt er die Fakten, aber nie die Identitätszeile —
 * sonst überschriebe sie nutzerdefinierte neutrale Rollen (#5016).
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

  it('trägt ihn auch in den Rollen-Chat, ohne die Grünerator-Identität', async () => {
    const prompt = await buildSystemMessage(
      state({ customSystemPrompt: 'Du bist ein*e Übersetzer*in.' })
    );

    expect(buildProductKnowledgeBlock).toHaveBeenCalledTimes(1);
    expect(prompt).toContain('## PRODUKTWISSEN');
    expect(prompt).not.toContain('Du bist Teil des Grünerator');
  });

  it('baut ihn im Rollen-Chat nicht ohne Produktfrage', async () => {
    await buildSystemMessage(
      state({
        customSystemPrompt: 'Du bist ein*e Übersetzer*in.',
        messages: [{ role: 'user', content: 'Übersetze: Guten Morgen' }],
      } as never)
    );

    expect(buildProductKnowledgeBlock).not.toHaveBeenCalled();
  });

  it('prüft die Frage ohne @-Erwähnungen, wie der Werkzeugkatalog', async () => {
    await buildSystemMessage(
      state({
        messages: [{ role: 'user', content: '@Pressesprecherin Was kannst du?' }],
        lastUserTextNoMentions: 'Was kannst du?',
      } as never)
    );

    expect(buildProductKnowledgeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Was kannst du?' })
    );
  });
});
