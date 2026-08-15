import { describe, it, expect, vi } from 'vitest';

import { isAmbiguousGraphicRequest } from './classifierHeuristics.js';
import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * "Grafik" names three different products in this app — a branded sharepic
 * template, a free AI image, and a data chart. Each costs a generation, so a
 * guess is wrong about two thirds of the time.
 *
 * Before this gate the word was swallowed by `imageKeywords` (which contains
 * `grafik`), so "erstelle eine Grafik zur Windkraft" silently produced an AI
 * image. Asking is cheaper than generating the wrong artifact.
 *
 * The interesting half is the NEGATIVE space: a message that already says which
 * kind it means must not be interrupted with a question.
 */

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: 'Du bist ein Assistent.',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

/** The LLM tier must never be reached by these cases — a call means the
 *  deterministic gate missed, which is itself the failure. */
function makeAiClient() {
  return {
    processRequest: vi.fn(async () => ({
      content: JSON.stringify({ intent: 'direct', reasoning: 'stub', searchQuery: null }),
    })),
  };
}

function buildState(userMessage: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, sharepic: true },
    aiClient: makeAiClient(),
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('isAmbiguousGraphicRequest', () => {
  it('fires on a bare "Grafik"/"Kachel" creation ask', () => {
    for (const t of [
      'Erstelle eine Grafik zur Windkraft',
      'Mach mir eine Kachel zur Kindergrundsicherung',
      'Ich brauche eine Grafik zum Radverkehr',
      'Gestalte eine Grafik über den Kohleausstieg',
    ]) {
      expect(isAmbiguousGraphicRequest(t), t).toBe(true);
    }
  });

  it('stands down when the kind is already named', () => {
    for (const t of [
      'Erstelle ein Sharepic zur Windkraft',
      'Mach mir eine Grafik als Sharepic',
      'Erstelle ein Balkendiagramm zur Windkraft',
      'Bau mir eine Grafik mit den Zahlen von 2025',
      'Zeichne mir eine Grafik von einem Windrad',
      'Erstelle eine Grafik, also ein Foto von einem Windrad',
      'Mach eine Infografik zur Kindergrundsicherung',
    ]) {
      expect(isAmbiguousGraphicRequest(t), t).toBe(false);
    }
  });

  it('stands down on questions, negations and quotes', () => {
    expect(isAmbiguousGraphicRequest('Was ist eigentlich eine gute Grafik?')).toBe(false);
    expect(isAmbiguousGraphicRequest('Mach das bitte ohne Grafik')).toBe(false);
    expect(isAmbiguousGraphicRequest('Sie schrieb: „Erstell eine Grafik dazu"')).toBe(false);
  });

  it('needs a creation ask, not a passing mention', () => {
    expect(isAmbiguousGraphicRequest('In der Grafik sieht man den Rückgang deutlich')).toBe(false);
  });
});

describe('classifierNode — Rückfrage statt Raten bei "Grafik"', () => {
  it('asks which kind instead of generating one', async () => {
    const result = await classifierNode(buildState('Erstelle eine Grafik zur Windkraft'));
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationKind).toBe('graphic_kind');
    expect(result.clarificationOptions).toEqual(['Sharepic', 'KI-Bild', 'Diagramm']);
    // The question has to explain the difference — the three words alone are
    // not self-evident to someone who has not used the product.
    expect(result.clarificationQuestion).toMatch(/Sharepic/);
    expect(result.clarificationQuestion).toMatch(/Diagramm/);
  });

  it('does not interrupt when the user named the kind', async () => {
    for (const msg of [
      'Erstelle ein Sharepic zur Windkraft',
      'Erstelle ein Balkendiagramm zur Windkraft',
      'Zeichne mir eine Grafik von einem Windrad',
    ]) {
      const result = await classifierNode(buildState(msg));
      expect(result.needsClarification, msg).not.toBe(true);
    }
  });

  it('does not interrupt with an image attached — that is an edit', async () => {
    const result = await classifierNode(
      buildState('Mach eine Grafik daraus', {
        imageAttachments: [{ mimeType: 'image/png', data: 'x' }],
      } as Partial<ChatGraphState>)
    );
    expect(result.needsClarification).not.toBe(true);
  });
});
