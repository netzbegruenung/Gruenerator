/**
 * GET /:id/original — access like the reader, then the kept upload or the
 * Wolke file, else 404.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveReaderSource = vi.fn();
const query = vi.fn();
const originalFile = vi.fn();
const fetchOriginal = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../notebook/notebookAccess.js', () => ({ checkNotebookAccess: vi.fn() }));
vi.mock('../../services/notebook/notebookSources.js', () => ({ resolveReaderSource }));
vi.mock('../../services/document-services/documentOriginals.js', () => ({ originalFile }));
vi.mock(
  '../../services/document-services/DocumentProcessingService/reindexOrigin.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchOriginal,
  })
);

async function startApp(): Promise<{ base: string; close: () => void }> {
  const { default: router } = await import('./originalController.js');
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

const row = {
  filename: 'Antrag.pdf',
  file_path: null as string | null,
  status: 'completed',
  wolke_share_link_id: null as string | null,
  wolke_file_path: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveReaderSource.mockResolvedValue({
    ownerUserId: 'owner-1',
    title: 'Antrag',
    sourceUrl: null,
  });
  query.mockResolvedValue([row]);
  originalFile.mockReturnValue(null);
});

async function get(url: string): Promise<Response> {
  const { base, close } = await startApp();
  try {
    return await fetch(`${base}${url}`).then(async (res) => {
      await res.clone().arrayBuffer();
      return res;
    });
  } finally {
    close();
  }
}

describe('GET /api/documents/:id/original', () => {
  it('checks access like the reader, through the notebook', async () => {
    resolveReaderSource.mockResolvedValueOnce(null);

    const res = await get('/api/documents/doc-1/original?notebookId=nb-1');

    expect(res.status).toBe(404);
    expect(resolveReaderSource).toHaveBeenCalledWith(
      { documentId: 'doc-1', notebookId: 'nb-1', userId: 'user-1' },
      expect.anything()
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('sends the kept upload under its original filename', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orig-')), 'doc-1.pdf');
    fs.writeFileSync(file, 'pdf-bytes');
    query.mockResolvedValueOnce([{ ...row, file_path: 'owner-1/doc-1.pdf' }]);
    originalFile.mockReturnValueOnce(file);

    const res = await get('/api/documents/doc-1/original');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('Antrag.pdf');
    expect(await res.text()).toBe('pdf-bytes');
    expect(originalFile).toHaveBeenCalledWith('owner-1/doc-1.pdf');
  });

  it('fetches a Wolke file with the owner’s share link', async () => {
    query.mockResolvedValueOnce([
      { ...row, wolke_share_link_id: 'link-1', wolke_file_path: '/Ordner/Antrag.pdf' },
    ]);
    fetchOriginal.mockResolvedValueOnce({ buffer: Buffer.from('wolke-bytes') });

    const res = await get('/api/documents/doc-1/original');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('wolke-bytes');
    expect(fetchOriginal).toHaveBeenCalledWith(
      { kind: 'wolke', shareLinkId: 'link-1', filePath: '/Ordner/Antrag.pdf' },
      { filename: 'Antrag.pdf' },
      'owner-1'
    );
  });

  it('answers 404 when no original was kept', async () => {
    const res = await get('/api/documents/doc-1/original');

    expect(res.status).toBe(404);
    expect(fetchOriginal).not.toHaveBeenCalled();
  });
});
