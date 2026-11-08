import { describe, expect, it } from 'vitest';

import {
  WHOLE_DOCUMENT_FLOOR_CHARS,
  documentChatIdsToSearch,
  picksOtherDocumentChat,
  resolveWholeDocumentTurn,
  wholeDocumentBudgetChars,
  wholeDocumentIdsInPrompt,
  wholeDocumentReadDirectly,
  wholeDocumentSkipsRetrieval,
} from './wholeDocument.js';

import type {
  ThreadAttachment,
  WholeDocumentTurn,
} from '../../../agents/langgraph/ChatGraph/types.js';

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
  turnDocs: [] as { name: string; text: string; documentId?: string | null; pasted?: boolean }[],
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

  // #5406: eine eingefügte Terminliste mit „Hier sind die Termine". Ein Paste
  // ist Material dieses Turns, kein Nachschlagewerk — er wird ganz gelesen,
  // auch ohne Zusammenfassungs-Auftrag.
  it('reads pasted text whole without a summary ask', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      userText: 'Hier sind die Termine',
      turnDocs: [{ name: 'Eingefügter Text.txt', text: 'y'.repeat(13_300), pasted: true }],
    });
    expect(turn).toMatchObject({ origin: 'turn', ask: 'paste', chars: 13_300, fits: true });
  });

  it('leaves an uploaded file next to the paste to retrieval when nothing asks for a summary', () => {
    expect(
      resolveWholeDocumentTurn({
        ...base,
        userText: 'Was steht im PDF zu den Terminen?',
        turnDocs: [
          { name: 'Eingefügter Text.txt', text: 'y'.repeat(13_300), pasted: true },
          { name: 'Protokoll.pdf', text: 'z'.repeat(60_000) },
        ],
      })
    ).toBeNull();
  });

  it('leaves a paste beyond the budget to retrieval when nothing asks for a summary', () => {
    // Map-Reduce wäre für „formatiere" die falsche Antwort; die Suche bleibt.
    expect(
      resolveWholeDocumentTurn({
        ...base,
        userText: 'Formatiere alle Termine',
        contextWindowTokens: 20_000,
        turnDocs: [{ name: 'Eingefügter Text.txt', text: 'y'.repeat(400_000), pasted: true }],
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

// #5478: live 08.11.2026 a 16k event list was pasted in one turn and asked about
// in the next („alle Termine vom Team Verkehr … Keinen weglassen") — the
// follow-up got a 6,000-char passage and listed 7 of 18 as „alle".
describe('resolveWholeDocumentTurn — the latest paste in a follow-up', () => {
  const paste = (over: Partial<ThreadAttachment>): ThreadAttachment =>
    row({ name: 'Eingefügter Text.txt', mimeType: 'text/plain', ...over });
  const followUp = {
    ...base,
    userText: 'Gib mir alle Termine vom Team Verkehr als Liste. Keinen weglassen.',
  };

  it('reads the latest paste whole when it was vectorized', () => {
    const turn = resolveWholeDocumentTurn({
      ...followUp,
      threadAttachments: [
        paste({ id: 'p', extractedText: 'y'.repeat(16_475), documentId: 'doc-p' }),
      ],
    });
    expect(turn).toMatchObject({ origin: 'thread', ask: 'paste', chars: 16_475, fits: true });
    expect(turn?.docs.map((d) => d.documentId)).toEqual(['doc-p']);
  });

  it('takes only the latest paste, older ones stay with retrieval', () => {
    const turn = resolveWholeDocumentTurn({
      ...followUp,
      threadAttachments: [
        paste({ id: 'old', documentId: 'doc-old-paste' }),
        paste({ id: 'new', extractedText: 'y'.repeat(16_475), documentId: 'doc-new-paste' }),
      ],
    });
    expect(turn?.docs.map((d) => d.documentId)).toEqual(['doc-new-paste']);
    expect(
      documentChatIdsToSearch({
        documentChatIds: ['doc-old-paste', 'doc-new-paste'],
        wholeDocument: turn,
      })
    ).toEqual(['doc-old-paste']);
  });

  it('leaves an uploaded file as the latest attachment to retrieval', () => {
    expect(
      resolveWholeDocumentTurn({ ...followUp, threadAttachments: [paste({}), row({ id: 'pdf' })] })
    ).toBeNull();
  });

  it('changes nothing for a small paste, which already rides in the prompt', () => {
    expect(
      resolveWholeDocumentTurn({ ...followUp, threadAttachments: [paste({ documentId: null })] })
    ).toBeNull();
  });

  it('leaves a paste beyond the budget to retrieval', () => {
    expect(
      resolveWholeDocumentTurn({
        ...followUp,
        contextWindowTokens: 20_000,
        threadAttachments: [paste({ extractedText: 'y'.repeat(400_000) })],
      })
    ).toBeNull();
  });

  it('leaves the thread alone when the turn names other material or is material itself', () => {
    const threadAttachments = [paste({})];
    expect(
      resolveWholeDocumentTurn({
        ...followUp,
        threadAttachments,
        turnReferencesOtherMaterial: true,
      })
    ).toBeNull();
    expect(
      resolveWholeDocumentTurn({
        ...followUp,
        userText: `Vergleiche damit:\n${'Absatz. '.repeat(100)}`,
        threadAttachments,
      })
    ).toBeNull();
  });
});

describe('picksOtherDocumentChat', () => {
  // The web client echoes every id from `document_indexed` back in each later
  // turn; its own paste must not count as „other material" (#5478).
  const noLoad = () => Promise.reject(new Error('must not load the whole thread'));

  it('does not count the thread attachments the client echoes back', async () => {
    await expect(picksOtherDocumentChat(['doc-p'], ['doc-p', 'doc-old'], noLoad)).resolves.toBe(
      false
    );
    await expect(picksOtherDocumentChat([], ['doc-p'], noLoad)).resolves.toBe(false);
  });

  it('counts a document the turn picked beyond the thread attachments', async () => {
    const all = () => Promise.resolve(['doc-p']);
    await expect(picksOtherDocumentChat(['doc-p', 'doc-picked'], ['doc-p'], all)).resolves.toBe(
      true
    );
  });

  // The prompt window holds the five most recent attachments, the echo is
  // uncapped: an older paste of the same thread is still its own material.
  it('does not count an echoed attachment that fell out of the window', async () => {
    const all = () => Promise.resolve(['doc-first', 'doc-p']);
    await expect(picksOtherDocumentChat(['doc-first', 'doc-p'], ['doc-p'], all)).resolves.toBe(
      false
    );
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

  it('keeps the carried thread documents searchable on a paste turn without a summary ask', () => {
    // „Vergleiche das mit dem PDF von vorhin" muss das PDF weiter finden.
    const turn = resolveWholeDocumentTurn({
      ...base,
      userText: 'Vergleiche diese Termine mit dem PDF von vorhin',
      turnDocs: [
        {
          name: 'Eingefügter Text.txt',
          text: 'y'.repeat(13_300),
          documentId: 'doc-paste',
          pasted: true,
        },
      ],
      threadAttachments: [row({})],
    });
    expect([...wholeDocumentSkipsRetrieval(turn, [row({})])]).toEqual(['doc-paste']);
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

describe('wholeDocumentReadDirectly', () => {
  it('names the documents summarize reads itself, also when they do not fit', () => {
    const turn = resolveWholeDocumentTurn({
      ...base,
      contextWindowTokens: 20_000,
      turnDocs: [{ name: 'Plenarprotokoll.pdf', text: 'z'.repeat(400_000), documentId: 'doc-new' }],
      threadAttachments: [row({})],
    });
    expect([...wholeDocumentReadDirectly(turn, [row({})])].sort()).toEqual(['doc-new', 'doc-old']);
    expect(wholeDocumentReadDirectly(null, [row({})]).size).toBe(0);
  });
});

describe('documentChatIdsToSearch', () => {
  const pasteTurn = resolveWholeDocumentTurn({
    ...base,
    userText: 'Hier sind die Termine',
    turnDocs: [
      {
        name: 'Eingefügter Text.txt',
        text: 'y'.repeat(13_300),
        documentId: 'doc-paste',
        pasted: true,
      },
    ],
  });

  it('drops the paste whose full text rides in the prompt, keeps everything else', () => {
    expect(
      documentChatIdsToSearch({
        documentChatIds: ['doc-paste', 'doc-old'],
        wholeDocument: pasteTurn,
      })
    ).toEqual(['doc-old']);
  });

  it('leaves a summary turn alone — its search scope is decided elsewhere', () => {
    const summary = resolveWholeDocumentTurn({
      ...base,
      turnDocs: [{ name: 'Bericht.pdf', text: 'z'.repeat(30_000), documentId: 'doc-pdf' }],
    });
    expect(
      documentChatIdsToSearch({ documentChatIds: ['doc-pdf'], wholeDocument: summary })
    ).toEqual(['doc-pdf']);
    expect(documentChatIdsToSearch({ documentChatIds: ['doc-pdf'], wholeDocument: null })).toEqual([
      'doc-pdf',
    ]);
  });
});
