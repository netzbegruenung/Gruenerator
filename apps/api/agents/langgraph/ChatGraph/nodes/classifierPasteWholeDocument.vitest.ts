import { describe, it, expect, vi } from 'vitest';

/**
 * Der Klassifikator ruft das Modell über `executeProvider` — nicht mehr über
 * einen `aiClient` im Zustand. Die Attrappe muss deshalb an dieser Tür stehen;
 * eine im Zustand hinterlegte wäre eine, die nichts abfängt: der echte Provider
 * würde versucht, am fehlenden API-Key scheitern und die Entscheidung in eine
 * heuristische Stufe zurückfallen lassen — grün gemeldet, nichts geprüft.
 *
 * `keine` heisst bei jedem der kleinen Auflöser „ich entscheide hier nichts".
 */
const executeProvider = vi.fn(async (..._args: unknown[]) => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent, TurnMaterialItem } from '../types.js';

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

function buildState(
  overrides: Partial<ChatGraphState> & {
    userMessage: string;
  }
): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, image_edit: true },
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
    wolkeFiles: [],
    connectFiles: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

const { getActiveAnchors } = await import('./anchorContext.js');
const { PASTED_TEXT_HEADING } =
  await import('../../../../routes/chat/services/attachmentProcessingService.js');
const { renderTurnMaterial } = await import('../../../../routes/chat/services/materialItems.js');

const material = (items: TurnMaterialItem[]) => ({
  turnMaterial: items,
  attachmentContext: renderTurnMaterial(items),
});

/**
 * #5406: ein eingefügter Text, der ganz im Prompt steht (`wholeDocument.ask ===
 * 'paste'`), ist kein Dokument-Chat. Er ist nur für die Folgeturns indiziert.
 * Zählte er als Dokument-Chat, erzwang der Klassifikator eine Suche, und der
 * Prompt meldete „auf ausgewählte Dokumente begrenzt" — live nachgestellt
 * antwortete das Modell dann „In deiner Nachricht sind keine Termine
 * angekommen" und fragte nach dem „angehängten Dokument".
 */
const PASTE = 'y'.repeat(13_300);
const pasteTurn = (over: Partial<ChatGraphState> = {}) =>
  buildState({
    userMessage: 'Hier sind die Termine',
    ...material([
      { kind: 'paste', name: 'Eingefügter Text.txt', heading: PASTED_TEXT_HEADING, text: PASTE },
    ]),
    documentChatIds: ['doc-paste'],
    wholeDocument: {
      origin: 'turn',
      ask: 'paste',
      docs: [{ name: 'Eingefügter Text.txt', text: PASTE, documentId: 'doc-paste' }],
      chars: PASTE.length,
      budgetChars: 224_000,
      fits: true,
    },
    ...over,
  });

describe('paste read whole — not a document chat', () => {
  it('the classifier does not force the document-chat search', async () => {
    const result = await classifierNode(pasteTurn());
    expect(result.reasoning ?? '').not.toContain('DocumentChat');
  });

  it('a summary turn over an indexed upload still goes through the document chat', async () => {
    const result = await classifierNode(pasteTurn({ wholeDocument: null }));
    expect(result.reasoning ?? '').toContain('DocumentChat');
  });

  it('an earlier indexed attachment in the scope keeps the document chat', async () => {
    const result = await classifierNode(pasteTurn({ documentChatIds: ['doc-paste', 'doc-old'] }));
    expect(result.reasoning ?? '').toContain('DocumentChat');
  });

  it('the prompt says „pasted into this message", not „limited to selected documents"', () => {
    const kinds = getActiveAnchors(pasteTurn()).map((a) => a.kind);
    expect(kinds).toContain('paste');
    expect(kinds).not.toContain('documentChat');
  });

  // #5423: „Hochgeladene Dateien … soweit relevant" las das Modell als
  // Hintergrund neben der Nachricht und fragte zurück.
  it('a paste alone is not framed as an uploaded file', () => {
    const kinds = getActiveAnchors(pasteTurn()).map((a) => a.kind);
    expect(kinds).not.toContain('attachment');
  });

  it('a paste next to an upload carries both anchors', () => {
    const kinds = getActiveAnchors(
      pasteTurn(
        material([
          {
            kind: 'upload',
            name: 'Antrag.pdf',
            heading: 'Antrag.pdf (Volltext-Auszug)',
            text: 'Text',
          },
          {
            kind: 'paste',
            name: 'Eingefügter Text.txt',
            heading: PASTED_TEXT_HEADING,
            text: PASTE,
          },
        ])
      )
    ).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['paste', 'attachment']));
  });
});
