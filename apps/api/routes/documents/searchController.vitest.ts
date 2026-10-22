/**
 * POST /api/documents/search: `documentIds` from the body scope the search, and
 * a scoped search runs without the `user_id` pin — so only ids the caller owns
 * may reach the search service.
 */
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWN = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';

const hybridSearch = vi.fn();
const textSearch = vi.fn();
const getDocumentById = vi.fn();

vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  DocumentSearchService: class {
    hybridSearch = hybridSearch;
    textSearch = textSearch;
  },
}));
vi.mock('../../services/document-services/PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({ getDocumentById }),
}));
vi.mock('../../services/document-services/DocumentContentService/index.js', async () => {
  const accessControl = await vi.importActual<
    typeof import('../../services/document-services/DocumentContentService/accessControl.js')
  >('../../services/document-services/DocumentContentService/accessControl.js');
  return {
    getDocumentContentService: () => ({}),
    getAccessibleDocuments: accessControl.getAccessibleDocuments,
  };
});

async function startApp(): Promise<{ base: string; close: () => void }> {
  const { default: router } = await import('./searchController.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { user?: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use('/api/documents/search', router);
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, close: () => void srv.close() });
    });
  });
}

async function search(body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const { base, close } = await startApp();
  try {
    const res = await fetch(`${base}/api/documents/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    close();
  }
}

const EMPTY = { success: true, results: [], query: 'q', searchType: 'hybrid', message: '' };

beforeEach(() => {
  hybridSearch.mockReset().mockResolvedValue(EMPTY);
  textSearch.mockReset().mockResolvedValue({ ...EMPTY, searchType: 'text' });
  getDocumentById
    .mockReset()
    .mockImplementation(async (id: string, userId: string) =>
      id === OWN && userId === 'user-1' ? { id: OWN } : null
    );
});

describe('POST /api/documents/search — scoped ids', () => {
  it('answers empty without searching when no requested id is owned', async () => {
    const res = await search({ query: 'Klima', documentIds: [FOREIGN] });

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, data: [] });
    expect(hybridSearch).not.toHaveBeenCalled();
    expect(textSearch).not.toHaveBeenCalled();
  });

  it('drops foreign ids and searches only the owned ones', async () => {
    await search({ query: 'Klima', documentIds: [FOREIGN, OWN] });

    expect(hybridSearch).toHaveBeenCalledTimes(1);
    expect(hybridSearch.mock.calls[0]?.[2]).toMatchObject({ documentIds: [OWN] });
  });

  it('applies the same check in text mode', async () => {
    const res = await search({ query: 'Klima', searchMode: 'text', documentIds: [FOREIGN] });

    expect(res.json).toMatchObject({ success: true, data: [] });
    expect(textSearch).not.toHaveBeenCalled();
  });

  it('fails closed when the ownership lookup throws', async () => {
    getDocumentById.mockRejectedValue(new Error('db down'));

    const res = await search({ query: 'Klima', documentIds: [OWN] });

    expect(res.json).toMatchObject({ success: true, data: [] });
    expect(hybridSearch).not.toHaveBeenCalled();
  });

  it('still searches the whole own library when no ids are sent', async () => {
    await search({ query: 'Klima' });

    expect(hybridSearch).toHaveBeenCalledTimes(1);
    expect(
      (hybridSearch.mock.calls[0]?.[2] as { documentIds?: unknown }).documentIds
    ).toBeUndefined();
  });
});
