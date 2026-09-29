/**
 * DELETE /saved-texts/bulk must reach the bulk handler, not
 * DELETE /saved-texts/:id with id "bulk" (#3846).
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trashSavedTexts = vi.fn();
const query = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: vi.fn(), query }),
}));
vi.mock('../../../database/services/QdrantService.js', () => ({
  getQdrantInstance: vi.fn(),
}));
vi.mock('../../../middleware/authMiddleware.js', () => ({
  default: {
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
      (req as { user?: { id: string } }).user = { id: 'user-1' };
      next();
    },
  },
}));
vi.mock('../../../services/document-services/TextChunker/index.js', () => ({
  smartChunkDocument: vi.fn(),
}));
vi.mock('../../../services/mistral/index.js', () => ({ mistralEmbeddingService: {} }));
vi.mock('../../../services/user/savedTextTrash.js', () => ({ trashSavedTexts }));

async function startApp(): Promise<{ base: string; close: () => void }> {
  const { default: router } = await import('./userLibrary.js');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, close: () => void srv.close() });
    });
  });
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([{ id: 'text-1' }, { id: 'text-2' }]);
  trashSavedTexts.mockReset().mockImplementation((_userId: string, ids: string[]) => ids);
});

describe('DELETE /saved-texts/bulk', () => {
  it('reaches the bulk handler instead of DELETE /saved-texts/:id', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/saved-texts/bulk`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['text-1', 'text-2'] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted_count: number };
      expect(body.deleted_count).toBe(2);
      expect(trashSavedTexts).toHaveBeenCalledWith('user-1', ['text-1', 'text-2']);
    } finally {
      close();
    }
  });

  it('still routes DELETE /saved-texts/:id to the single handler', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/saved-texts/text-1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(trashSavedTexts).toHaveBeenCalledWith('user-1', ['text-1']);
      expect(query).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});
