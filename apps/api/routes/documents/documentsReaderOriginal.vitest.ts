/**
 * `documents.getReader` tells the client whether a kept original exists, so the
 * reader shows „Original öffnen" only where the endpoint can answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveReaderSource = vi.fn();
const readSourceText = vi.fn(async () => ({ text: 'Beschluss zum Radweg' }));

vi.mock('../../services/notebook/notebookSources.js', () => ({
  resolveReaderSource,
  readSourceText,
}));
vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  DocumentSearchService: class {},
}));
vi.mock('../../services/document-services/PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({}),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));
vi.mock('../notebook/notebookAccess.js', () => ({ checkNotebookAccess: vi.fn() }));

const { documentsContractRouter } = await import('./documentsContractRouter.js');

type ReaderArgs = Parameters<typeof documentsContractRouter.getReader>[0];
const args = {
  req: { user: { id: 'member-1' }, originalUrl: '/api/documents/d1/reader' },
  params: { id: 'd1' },
  query: { notebookId: 'n1', query: null },
} as unknown as ReaderArgs;

const source = (original: unknown) => ({
  ownerUserId: 'owner-1',
  title: 'Antrag',
  sourceUrl: null,
  original,
});

beforeEach(() => resolveReaderSource.mockReset());

describe('documents.getReader — hasOriginal', () => {
  it('is true when the upload kept its original', async () => {
    resolveReaderSource.mockResolvedValue(
      source({ path: 'owner-1/d1.pdf', filename: 'a.pdf', mimetype: null })
    );
    const res = await documentsContractRouter.getReader(args);
    expect(res.status).toBe(200);
    expect((res.body as { hasOriginal?: boolean }).hasOriginal).toBe(true);
  });

  it('is false for a document without one', async () => {
    resolveReaderSource.mockResolvedValue(source(null));
    const res = await documentsContractRouter.getReader(args);
    expect((res.body as { hasOriginal?: boolean }).hasOriginal).toBe(false);
  });
});
