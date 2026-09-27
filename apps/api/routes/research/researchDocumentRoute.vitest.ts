/**
 * The reader endpoint's wiring: collection check, the Landesverband scoping
 * filter, status mapping and the payload fields it passes on. The full-text
 * lookup is mocked; the text split has its own tests in documentReader.vitest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSystemDocumentFullTextByUrl = vi.fn();

vi.mock('../../services/document-services/index.js', () => ({
  getQdrantDocumentService: () => ({ getSystemDocumentFullTextByUrl }),
}));

const { researchContractRouter } = await import('./researchContractRouter.js');

const call = (query: Record<string, string>) => researchContractRouter.document({ query } as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/research/document', () => {
  it('rejects an unknown collection', async () => {
    const res = await call({ collectionId: 'nope-system', sourceUrl: 'https://x.de' });
    expect(res.status).toBe(400);
    expect(getSystemDocumentFullTextByUrl).not.toHaveBeenCalled();
  });

  it('rejects an agent-only collection', async () => {
    const res = await call({
      collectionId: 'ricarda-lang-tweets-system',
      sourceUrl: 'https://x.de',
    });
    expect(res.status).toBe(400);
  });

  it('scopes the lookup to the Landesverband and returns the reader document', async () => {
    getSystemDocumentFullTextByUrl.mockResolvedValue({
      success: true,
      fullText: 'Hitzeschutz muss Pflicht werden. Dazu gehört ein Plan.',
      chunkCount: 1,
      title: 'Hitzeschutz für alle',
      payload: {
        source_url: 'https://gruene.berlin/beschluesse/hitze',
        source_name: 'Grüne Berlin',
        content_type_label: 'Beschluss',
        published_at: '2024-05-12',
      },
    });

    const res = await call({
      collectionId: 'berlin-system',
      sourceUrl: 'https://gruene.berlin/beschluesse/hitze',
      query: 'Hitzeschutz',
    });

    expect(getSystemDocumentFullTextByUrl).toHaveBeenCalledWith(
      'landesverbaende_documents',
      'https://gruene.berlin/beschluesse/hitze',
      { must: [{ key: 'landesverband', match: { any: ['BE', 'BE-F'] } }] }
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Hitzeschutz für alle',
      sourceUrl: 'https://gruene.berlin/beschluesse/hitze',
      sourceName: 'Grüne Berlin',
      contentTypeLabel: 'Beschluss',
      publishedAt: '2024-05-12',
      passages: [{ index: 0, heading: null, text: 'Hitzeschutz muss Pflicht werden.' }],
    });
  });

  it('answers 404 for a document that is not there', async () => {
    getSystemDocumentFullTextByUrl.mockResolvedValue({
      success: false,
      fullText: '',
      chunkCount: 0,
      error: 'Document not found',
    });
    const res = await call({ collectionId: 'berlin-system', sourceUrl: 'https://x.de' });
    expect(res.status).toBe(404);
  });

  it('answers 500 when the lookup itself fails', async () => {
    getSystemDocumentFullTextByUrl.mockResolvedValue({
      success: false,
      fullText: '',
      chunkCount: 0,
      error: 'Qdrant not available',
    });
    const res = await call({ collectionId: 'berlin-system', sourceUrl: 'https://x.de' });
    expect(res.status).toBe(500);
  });
});
