/**
 * Transportweg der Dokument-ID zum Chunk-Abruf, auf Routing-Ebene: eine
 * URL-förmige ID überlebt den PFAD nicht — der Reverse-Proxy dekodiert %2F
 * und merged Slashes, bevor Express routet (beta, 03.09.2026: kodiert
 * gesendet, `https:/…` kam an, Express-404 vor jedem Handler). Deshalb gibt
 * es `GET /chunks?documentId=…` als Query-Transport neben `GET /:id/chunks`.
 */
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocumentChunks = vi.fn();
const getDocumentById = vi.fn();

vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  DocumentSearchService: class {
    getDocumentChunks = getDocumentChunks;
  },
}));
vi.mock('../../services/document-services/PostgresDocumentService/index.js', () => ({
  getPostgresDocumentService: () => ({ getDocumentById }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('./helpers.js', () => ({ enrichDocumentWithPreview: vi.fn() }));

async function startApp(): Promise<{ base: string; close: () => void }> {
  const { default: router } = await import('./retrievalController.js');
  const app = express();
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
  getDocumentChunks.mockReset().mockResolvedValue({
    success: true,
    chunks: [{ index: 0, text: 'Text', tokens: 3, pageNumber: null }],
    chunkCount: 1,
  });
  getDocumentById.mockReset().mockResolvedValue(null);
});

describe('GET /api/documents/chunks — Query-Transport', () => {
  it('liest die documentId aus dem Query-String', async () => {
    const url = 'https://kommunalwiki.boell.de/index.php/Zusammenarbeit_im_Team';
    const { base, close } = await startApp();
    try {
      const res = await fetch(
        `${base}/api/documents/chunks?documentId=${encodeURIComponent(url)}&collectionId=kommunalwiki-system`
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; document_id: string };
      expect(body.success).toBe(true);
      expect(body.document_id).toBe(url);
      expect(getDocumentChunks).toHaveBeenCalledWith('user-1', url, {
        qdrantCollection: 'kommunalwiki_documents',
      });
    } finally {
      close();
    }
  });

  it('antwortet 400 ohne documentId', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/documents/chunks?collectionId=kommunalwiki-system`);
      expect(res.status).toBe(400);
    } finally {
      close();
    }
  });

  it('bedient den bisherigen Pfad-Transport unverändert', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/documents/doc-1/chunks?collectionId=grundsatz-system`);
      expect(res.status).toBe(200);
      expect(getDocumentChunks).toHaveBeenCalledWith('user-1', 'doc-1', {
        qdrantCollection: 'grundsatz_documents',
      });
    } finally {
      close();
    }
  });
});
