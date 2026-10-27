import { beforeEach, describe, expect, it, vi } from 'vitest';

// An @doc pick of a presentation (#4895): the picker offers decks, so the
// doc-mention path has to read them — through the deck's own reader, not the
// BlockNote HTML it does not have.

const pg = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => pg,
}));

const deck = vi.hoisted(() => ({
  loadPresentationState: vi.fn(),
  formatPresentationAsContext: vi.fn(),
}));
vi.mock('../../../services/presentations/PresentationGenerationService.js', () => deck);

const docs = vi.hoisted(() => ({ getDocumentHtml: vi.fn() }));
vi.mock('../../../services/docs/docContentService.js', () => docs);

const { enrichContext } = await import('./contextEnrichmentService.js');

async function enrichWith(ids: string[]) {
  const initialState = { messages: [] } as { documentMentionContext?: string | null };
  await enrichContext({
    initialState: initialState as never,
    userId: 'u1',
    rawDocMentionIds: ids,
    docAttachments: [],
    processedMeta: [],
    contextWindowTokens: 128_000,
    sse: { send: vi.fn(), isEnded: () => false } as never,
  });
  return initialState.documentMentionContext ?? null;
}

describe('@doc mention of a presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets presentations through the access query', async () => {
    pg.query.mockResolvedValue([]);
    await enrichWith(['p1']);
    const sql = pg.query.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain("'presentations'");
  });

  it('reads the deck through the presentation reader', async () => {
    pg.query.mockResolvedValue([
      { id: 'p1', title: 'Radwege', content: null, document_subtype: 'presentations' },
    ]);
    deck.loadPresentationState.mockResolvedValue({ title: 'Radwege', slides: [] });
    deck.formatPresentationAsContext.mockReturnValue('# Radwege\n\n## Folie 1: Sichere Kreuzungen');

    const context = await enrichWith(['p1']);

    expect(deck.loadPresentationState).toHaveBeenCalledWith('p1', 'u1');
    expect(docs.getDocumentHtml).not.toHaveBeenCalled();
    expect(context).toContain('### Radwege');
    expect(context).toContain('Sichere Kreuzungen');
  });

  it('keeps reading text documents from Yjs', async () => {
    pg.query.mockResolvedValue([
      { id: 'd1', title: 'Antrag', content: null, document_subtype: 'docs' },
    ]);
    docs.getDocumentHtml.mockResolvedValue({ html: '<p>Tempo 30</p>', live: false });

    const context = await enrichWith(['d1']);

    expect(deck.loadPresentationState).not.toHaveBeenCalled();
    expect(context).toContain('Tempo 30');
  });
});
