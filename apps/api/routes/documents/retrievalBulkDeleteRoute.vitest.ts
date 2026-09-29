/**
 * DELETE /bulk must reach the bulk handler, not DELETE /:id with id "bulk" (#3846).
 */
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trashDocument = vi.fn();
const trashDocuments = vi.fn();

vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  DocumentSearchService: class {},
}));
vi.mock('../../services/document-services/PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({ trashDocument, trashDocuments }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('./helpers.js', () => ({ enrichDocumentWithPreview: vi.fn() }));

async function startApp(): Promise<{ base: string; close: () => void }> {
  const { default: router } = await import('./retrievalController.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { user?: { id: string } }).user = { id: 'user-1' };
    next();
  });
  app.use('/api/documents', router);
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, close: () => void srv.close() });
    });
  });
}

beforeEach(() => {
  trashDocument.mockReset().mockResolvedValue(undefined);
  trashDocuments.mockReset().mockResolvedValue(['doc-1', 'doc-2']);
});

describe('DELETE /api/documents/bulk', () => {
  it('reaches the bulk handler instead of DELETE /:id', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/documents/bulk`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['doc-1', 'doc-2'] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted_count: number };
      expect(body.deleted_count).toBe(2);
      expect(trashDocuments).toHaveBeenCalledWith(['doc-1', 'doc-2'], 'user-1');
      expect(trashDocument).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('still routes DELETE /:id to the single handler', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/documents/doc-1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(trashDocument).toHaveBeenCalledWith('doc-1', 'user-1');
      expect(trashDocuments).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});
