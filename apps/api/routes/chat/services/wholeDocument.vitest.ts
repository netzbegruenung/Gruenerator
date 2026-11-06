import { describe, expect, it } from 'vitest';

import {
  WHOLE_DOCUMENT_FLOOR_CHARS,
  resolveWholeDocumentTurn,
  wholeDocumentBudgetChars,
  wholeDocumentIdsInPrompt,
  wholeDocumentSkipsRetrieval,
} from './wholeDocument.js';

import type { ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const row = (over: Partial<ThreadAttachment>): ThreadAttachment => ({
  id: 'a',
  name: 'document.pdf',
  mimeType: 'application/pdf',
  isImage: false,
  extractedText: 'x'.repeat(23_000),
  documentId: 'doc-old',
  summary: null,
  hasFileData: false,
  createdAt: new Date(0),
  ...over,
});

const base = {
  userText: 'Bitte fasse den Text kurz zusammen:',
  turnDocs: [] as { name: string; text: string; documentId?: string | null }[],
  threadAttachments: [] as ThreadAttachment[],
  turnReferencesOtherMaterial: false,
  contextWindowTokens: 86_600,
};

describe('wholeDocumentBudgetChars', () => {
  it('gives half the window, measured in characters', () => {
    expect(wholeDocumentBudgetChars(86_600)).toBe(Math.floor(86_600 * 0.5 * 3.5));
  });

  it('never drops below the floor, also without a known window', () => {
    expect(wholeDocumentBudgetChars(undefined)).toBe(WHOLE_DOCUMENT_FLOOR_CHARS);
    expect(wholeDocumentBudgetChars(8_000)).toBe(WHOLE_DOCUMENT_FLOOR_CHARS);
  });
});

describe('resolveWholeDocumentTurn', () => {
  it('is null for a turn that does not ask for a summary', () => {
    expect(
      resolveWholeDocumentTurn({
        ...base,
        userText: 'Was steht auf Seite 4 zu den Löschfristen?',
        threadAttachments: [row({})],
      })
    ).toBeNull();
  });

  // Live 06.11.2026, Thread f421f2a5: eine Seite eingefügt (Paste-Chip), im
  // Gespräch lag das 30-seitige PDF von vorhin — summarizeNode fasste das PDF zusammen.
  it('takes the material of THIS turn over an earlier document of the thread', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      turnDocs: [{ name: 'Eingefügter Text.txt', text: 'y'.repeat(3_671) }],
      threadAttachments: [row({})],
    });
    expect(turn?.origin).toBe('turn');
    expect(turn?.docs.map((d) => d.name)).toEqual(['Eingefügter Text.txt']);
    expect(turn?.chars).toBe(3_671);
    expect(turn?.fits).toBe(true);
  });

  it('falls back to the earlier documents when the turn brings none', () => {
    const turn = resolveWholeDocumentTurn({ ...base, threadAttachments: [row({})] });
    expect(turn?.origin).toBe('thread');
    expect(turn?.docs).toEqual([
      { name: 'document.pdf', text: 'x'.repeat(23_000), documentId: 'doc-old' },
    ]);
  });

  it('skips images and rows without stored text', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      threadAttachments: [
        row({ id: 'img', isImage: true, extractedText: null, summary: 'Ein Foto' }),
        row({ id: 'legacy', extractedText: null, summary: 'kurz' }),
      ],
    });
    expect(turn).toBeNull();
  });

  it('leaves the thread alone when the turn names other material (@datei, notebook)', () => {
    expect(
      resolveWholeDocumentTurn({
        ...base,
        threadAttachments: [row({})],
        turnReferencesOtherMaterial: true,
      })
    ).toBeNull();
  });

  it('leaves the thread alone when the message itself is the material', () => {
    expect(
      resolveWholeDocumentTurn({
        ...base,
        userText: `Fasse zusammen:\n${'Absatz. '.repeat(100)}`,
        threadAttachments: [row({})],
      })
    ).toBeNull();
  });

  it('reports a document larger than the budget as not fitting', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      contextWindowTokens: 20_000,
      turnDocs: [{ name: 'Plenarprotokoll.pdf', text: 'z'.repeat(400_000) }],
    });
    expect(turn?.fits).toBe(false);
    expect(turn?.budgetChars).toBe(WHOLE_DOCUMENT_FLOOR_CHARS);
  });
});

describe('wholeDocumentIdsInPrompt', () => {
  it('names the document ids whose full text rides in the prompt', () => {
    const turn = resolveWholeDocumentTurn({ ...base, threadAttachments: [row({})] });
    expect([...wholeDocumentIdsInPrompt(turn)]).toEqual(['doc-old']);
  });

  it('is empty when the text does not fit — then nothing rides in the prompt', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      contextWindowTokens: 20_000,
      threadAttachments: [row({ extractedText: 'z'.repeat(400_000) })],
    });
    expect(wholeDocumentIdsInPrompt(turn).size).toBe(0);
    expect(wholeDocumentIdsInPrompt(null).size).toBe(0);
  });
});

describe('wholeDocumentSkipsRetrieval', () => {
  it('skips the carried thread documents when THIS turn brought the material', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      turnDocs: [{ name: 'Eingefügter Text.txt', text: 'y'.repeat(3_671) }],
      threadAttachments: [row({})],
    });
    expect([...wholeDocumentSkipsRetrieval(turn, [row({})])]).toEqual(['doc-old']);
  });

  it('retrieves as before when the text does not fit', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      contextWindowTokens: 20_000,
      turnDocs: [{ name: 'Plenarprotokoll.pdf', text: 'z'.repeat(400_000), documentId: 'doc-new' }],
      threadAttachments: [row({})],
    });
    expect(wholeDocumentSkipsRetrieval(turn, [row({})]).size).toBe(0);
  });
});
