import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TurnMaterialItem } from '../../../agents/langgraph/ChatGraph/types.js';

const uploads: Array<{ originalname: string; text: string | null | undefined; bytes: string }> = [];

vi.mock('../../../services/document-services/PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({}),
}));
vi.mock('../../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({}),
}));
vi.mock('../../../services/document-services/DocumentProcessingService/fileProcessing.js', () => ({
  processFileUpload: vi.fn(
    (
      _pg: unknown,
      _qdrant: unknown,
      _userId: string,
      file: { buffer: Buffer; originalname: string },
      _title: string,
      _kind: string,
      text: string | null | undefined
    ) => {
      uploads.push({
        originalname: file.originalname,
        text,
        bytes: file.buffer.toString('utf8'),
      });
      return Promise.resolve({ id: `doc-${uploads.length}`, title: file.originalname });
    }
  ),
}));

const { enrichContext } = await import('./contextEnrichmentService.js');
const { PASTED_TEXT_HEADING } = await import('./attachmentProcessingService.js');
const { setTurnMaterial } = await import('./materialItems.js');
const { formatThreadAttachmentsContext } =
  await import('../../../agents/langgraph/ChatGraph/nodes/respondNode.js');

const NAME = 'Eingefügter Text.txt';
const para = (tag: string, chars: number): string =>
  `${tag} `.padEnd(chars, `${tag}-Satz über Radverkehr. `);

function paste(text: string) {
  return {
    name: NAME,
    type: 'text/plain',
    size: text.length,
    isImage: false,
    data: Buffer.from(text, 'utf8').toString('base64'),
  };
}
const meta = (text: string) => ({
  name: NAME,
  mimeType: 'text/plain',
  sizeBytes: text.length,
  isImage: false,
  extractedText: text,
});

const pasteItem = (text: string): TurnMaterialItem => ({
  kind: 'paste',
  name: NAME,
  heading: PASTED_TEXT_HEADING,
  text,
});
const uploadItem = (name: string, text: string): TurnMaterialItem => ({
  kind: 'upload',
  name,
  heading: `${name} (Volltext-Auszug)`,
  text,
});

async function runEnrich(texts: string[], userText = '') {
  const initialState = {
    attachmentContext: null as string | null,
    turnMaterial: [] as TurnMaterialItem[],
    documentChatIds: [] as string[],
    messages: userText ? [{ role: 'user', content: userText }] : [],
    threadAttachments: [],
  };
  setTurnMaterial(initialState, texts.map(pasteItem));
  await enrichContext({
    initialState: initialState as never,
    userId: 'u1',
    docAttachments: texts.map(paste) as never,
    processedMeta: texts.map(meta) as never,
    contextWindowTokens: 128_000,
    sse: { send: vi.fn() } as never,
  });
  return initialState as unknown as {
    attachmentContext: string | null;
    documentChatIds: string[];
    wholeDocument?: { origin: string; fits: boolean } | null;
  };
}

beforeEach(() => {
  uploads.length = 0;
});

describe('paste with typed text — current turn routing', () => {
  it.each([
    ['1k', 1_000],
    ['5k', 5_000],
    ['11.9k', 11_900],
  ])('%s stays fully inline', async (_l, n) => {
    const s = await runEnrich([para('A', n)]);
    expect(s.documentChatIds).toEqual([]);
    expect(s.attachmentContext).toContain('A-Satz');
  });

  // Live 04.11.2026 (#5406, Thread aad8d508): „Hier sind die Termine" über einer
  // langen Terminliste. Über 12k vektorisiert, der Turn wurde zur Suche nach
  // „Termine", und das Modell antwortete „Du hast mir keinen Text geschickt" —
  // auf gruenerator.eu nachgestellt: 38 von 110 Terminen, der Rest still weg.
  it.each([
    ['12k', 12_000],
    ['30k', 30_000],
  ])('%s is indexed for follow-ups AND stays inline, whatever the order', async (_l, n) => {
    const s = await runEnrich([para('A', n)], 'Hier sind die Termine');
    expect(s.documentChatIds).toHaveLength(1);
    expect(s.attachmentContext).toContain('A-Satz');
    expect(s.wholeDocument).toMatchObject({ origin: 'turn', fits: true });
  });

  it('a paste beyond the whole-document budget is vectorized and dropped as before', async () => {
    const s = await runEnrich([para('A', 300_000)], 'Hier sind die Termine');
    expect(s.documentChatIds).toHaveLength(1);
    expect(s.attachmentContext ?? '').not.toContain('A-Satz');
    expect(s.wholeDocument ?? null).toBeNull();
  });
});

describe('paste with a summary ask — whole-document turn', () => {
  // Live 06.11.2026: „fasse zusammen" over a large paste got 6.000 chars of
  // passages. The text stays in the prompt; indexed for follow-ups all the same.
  it('30k stays inline AND is indexed', async () => {
    const s = await runEnrich([para('A', 30_000)], 'Bitte fasse den Text kurz zusammen');
    expect(s.documentChatIds).toHaveLength(1);
    expect(s.attachmentContext).toContain('A-Satz');
    expect(s.wholeDocument).toMatchObject({ origin: 'turn', fits: true });
  });
});

describe('two pastes in ONE message (same file name)', () => {
  it('small + large: the large one is indexed under ITS OWN text, both stay inline', async () => {
    const s = await runEnrich([para('KLEIN', 3_000), para('GROSS', 20_000)]);
    expect(uploads.map((u) => u.text?.slice(0, 5))).toEqual(['GROSS']);
    expect(s.attachmentContext ?? '').toContain('KLEIN');
    expect(s.attachmentContext ?? '').toContain('GROSS');
  });

  it('large + small: nothing from the small one is indexed under the large text', async () => {
    const large = para('GROSS', 20_000);
    const small = para('KLEIN', 3_000);
    const s = await runEnrich([large, small]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.text?.slice(0, 5)).toBe('GROSS');
    // the small paste must stay readable inline
    expect(s.attachmentContext ?? '').toContain('KLEIN');
  });

  it('two large: each is indexed under its own text', async () => {
    await runEnrich([para('ERSTE', 15_000), para('ZWEITE', 15_000)]);
    expect(uploads.map((u) => u.text?.slice(0, 5))).toEqual(['ERSTE', 'ZWEIT']);
  });
});

// Neben einer vektorisierten Datei baut enrichContext den Inline-Block neu
// (keine Ganzdokument-Aufgabe: nicht alles Material ist eingefügt). Auch dort
// trägt der Paste seine eigene Überschrift (#5423).
describe('paste next to a vectorized upload', () => {
  const big = para('GROSS', 15_000);
  const small = para('KLEIN', 2_000);

  async function rebuild(items: TurnMaterialItem[]) {
    const initialState = {
      attachmentContext: null as string | null,
      turnMaterial: [] as TurnMaterialItem[],
      documentChatIds: [] as string[],
      messages: [{ role: 'user', content: 'Hier sind die Termine' }],
      threadAttachments: [],
    };
    setTurnMaterial(initialState, items);
    await enrichContext({
      initialState: initialState as never,
      userId: 'u1',
      docAttachments: [{ ...paste(big), name: 'bericht.txt' }, paste(small)] as never,
      processedMeta: [{ ...meta(big), name: 'bericht.txt' }, meta(small)] as never,
      contextWindowTokens: 128_000,
      sse: { send: vi.fn() } as never,
    });
    return initialState;
  }

  it('keeps the paste heading when the inline block is rebuilt', async () => {
    const s = await rebuild([uploadItem('bericht.txt', big), pasteItem(small)]);
    expect(s.documentChatIds).toHaveLength(1);
    expect(s.attachmentContext).toBe(`### ${PASTED_TEXT_HEADING}\n\n${small}`);
  });

  // Der Neuaufbau setzte den Text früher nur aus den kleinen Dateien zusammen —
  // Kontext vom Client und Referenzen desselben Turns fielen still heraus (#5430).
  it('keeps client context and references next to the rebuilt files', async () => {
    const client: TurnMaterialItem = { kind: 'client', text: 'Editor-Inhalt' };
    const ref: TurnMaterialItem = {
      kind: 'reference',
      heading: 'REFERENZIERTE TEXTE',
      text: 'Gespeicherter Text',
    };
    const s = await rebuild([client, uploadItem('bericht.txt', big), pasteItem(small), ref]);
    expect(s.turnMaterial).toEqual([client, pasteItem(small), ref]);
    expect(s.attachmentContext).toBe(
      `Editor-Inhalt\n\n---\n\n### ${PASTED_TEXT_HEADING}\n\n${small}\n\n---\n\n## REFERENZIERTE TEXTE\n\nGespeicherter Text`
    );
  });
});

describe('earlier pastes in the same thread', () => {
  const row = (text: string, documentId: string | null = null) => ({
    id: text.slice(0, 3),
    name: NAME,
    mimeType: 'text/plain',
    isImage: false,
    extractedText: text,
    documentId,
    summary: null,
    hasFileData: false,
    createdAt: new Date(),
  });

  it('older inline pastes are labelled so the newest cannot be mistaken for an old one', () => {
    const out = formatThreadAttachmentsContext(
      [row(para('ALT1', 2_000)), row(para('ALT2', 2_000))],
      128_000,
      '',
      [],
      ''
    );
    expect(out).toContain('ALT1');
    expect(out).toContain('ALT2');
    // two blocks with the identical title and no recency marker
    expect(out).toMatch(/frühere|Fassung|älter/i);
  });

  // #5423: in Folge-Turns stand er als „Eingefügter Text.txt (Volltext-Auszug)".
  it('an earlier paste is named as text from an earlier message, not as a file', () => {
    const out = formatThreadAttachmentsContext([row(para('ALT', 2_000))], 128_000, '', [], '');
    expect(out).toContain('### 1. Eingefügter Text aus einer früheren Nachricht vom ');
    expect(out).not.toContain('Eingefügter Text.txt');
  });

  // Thread 68fbdea9 (02.11.2026): fünf gleich überschriebene Pastes, und auf
  // „ganze text bitte" kam der Mail-Entwurf vom 30.10. statt des Pressespiegels.
  it('tells earlier pastes apart by time and opening, and marks the newest', () => {
    const at = (iso: string, text: string) => ({ ...row(text), createdAt: new Date(iso) });
    const out = formatThreadAttachmentsContext(
      [
        at('2026-10-30T13:11:01Z', 'Betreff: Ihr Interview mit dem Leiter der MA 31 zur Lobau'),
        at('2026-11-02T06:05:54Z', 'Liebe alle, anbei der LobAu-Pressespiegel Oktober 2026.'),
      ],
      128_000,
      '',
      [],
      ''
    );
    expect(out).toContain(
      '### 1. Eingefügter Text aus einer früheren Nachricht vom 30.10., 14:11, beginnt mit „Betreff: Ihr Interview mit dem Leiter der MA 31 zur Lobau“ (Volltext-Auszug)'
    );
    expect(out).toContain(
      '### 2. Eingefügter Text aus einer früheren Nachricht vom 02.11., 07:05, beginnt mit „Liebe alle, anbei der LobAu-Pressespiegel Oktober 2026.“ (zuletzt eingefügt, Volltext-Auszug)'
    );
  });

  it('survives a createdAt that came back from JSON as a string', () => {
    const rehydrated = { ...row(para('ALT', 2_000)), createdAt: '2026-11-02T06:05:54.000Z' };
    const out = formatThreadAttachmentsContext(
      [rehydrated as unknown as ReturnType<typeof row>],
      128_000,
      '',
      [],
      ''
    );
    expect(out).toContain('vom 02.11., 07:05, beginnt mit „ALT ALT-Satz');
  });

  it('an older vectorized paste does not shadow the current inline one', () => {
    const out = formatThreadAttachmentsContext(
      [row(para('ALT', 20_000), 'doc-old')],
      128_000,
      '',
      [pasteItem(para('NEU', 3_000))],
      ''
    );
    expect(out).not.toContain('ALT-Satz');
  });
});
