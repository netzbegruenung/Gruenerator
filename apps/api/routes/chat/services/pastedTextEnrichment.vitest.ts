import { beforeEach, describe, expect, it, vi } from 'vitest';

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

async function runEnrich(texts: string[]) {
  const initialState = {
    attachmentContext: texts
      .map((t) => `### ${NAME} (Volltext-Auszug)\n\n${t}`)
      .join('\n\n---\n\n'),
    documentChatIds: [] as string[],
    messages: [],
  };
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

  it.each([
    ['12k', 12_000],
    ['30k', 30_000],
  ])('%s is vectorized and the inline text is dropped', async (_l, n) => {
    const s = await runEnrich([para('A', n)]);
    expect(s.documentChatIds).toHaveLength(1);
    expect(s.attachmentContext ?? '').not.toContain('A-Satz');
  });
});

describe('two pastes in ONE message (same file name)', () => {
  it('small + large: the large one is indexed under ITS OWN text, the small stays inline', async () => {
    const s = await runEnrich([para('KLEIN', 3_000), para('GROSS', 20_000)]);
    expect(uploads.map((u) => u.text?.slice(0, 5))).toEqual(['GROSS']);
    expect(s.attachmentContext ?? '').toContain('KLEIN');
    expect(s.attachmentContext ?? '').not.toContain('GROSS');
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
      '',
      ''
    );
    expect(out).toContain('ALT1');
    expect(out).toContain('ALT2');
    // two blocks with the identical title and no recency marker
    expect(out).toMatch(/frühere|Fassung|älter/i);
  });

  it('an older vectorized paste does not shadow the current inline one', () => {
    const out = formatThreadAttachmentsContext(
      [row(para('ALT', 20_000), 'doc-old')],
      128_000,
      '',
      `### ${NAME} (Volltext-Auszug)\n\n${para('NEU', 3_000)}`,
      ''
    );
    expect(out).not.toContain('ALT-Satz');
  });
});
