/**
 * GET /api/documents/:id/original — the kept upload behind „Original öffnen".
 * Same access rule as the reader (`resolveReaderSource`); everything that is
 * not readable answers 404, so a foreign document looks like a missing one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveReaderSource = vi.fn();

vi.mock('../../services/notebook/notebookSources.js', () => ({ resolveReaderSource }));

const findSystemPdfSource = vi.fn();
const loadSystemOriginal = vi.fn();
vi.mock('../../services/notebook/systemOriginals.js', () => ({
  findSystemPdfSource,
  loadSystemOriginal,
}));
const systemMediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), '.system-media-'));
vi.mock('../../services/systemMedia/storage.js', () => ({
  getSystemMediaStorage: () => ({
    resolveLocalPath: (key: string) => path.join(systemMediaRoot, key),
  }),
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
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../notebook/notebookAccess.js', () => ({ checkNotebookAccess: vi.fn() }));
vi.mock('./helpers.js', () => ({ enrichDocumentWithPreview: vi.fn() }));

// Imported once: the controller's cold import takes seconds and would eat the
// first test's timeout.
const { default: router } = await import('./retrievalController.js');

async function startApp(): Promise<{ base: string; close: () => void }> {
  const app = express();
  app.use((req, _res, next) => {
    (req as { user?: { id: string } }).user = { id: 'member-1' };
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

let originals: string;

const source = (original: unknown) => ({
  ownerUserId: 'owner-1',
  title: 'Antrag',
  sourceUrl: null,
  original,
});

beforeEach(() => {
  originals = fs.mkdtempSync(path.join(os.tmpdir(), 'originals-'));
  vi.stubEnv('DOCUMENT_ORIGINALS_DIR', originals);
  fs.mkdirSync(path.join(originals, 'owner-1'));
  fs.writeFileSync(path.join(originals, 'owner-1/d1.pdf'), '%PDF-1.4 original');
  resolveReaderSource
    .mockReset()
    .mockResolvedValue(
      source({ path: 'owner-1/d1.pdf', filename: 'Antrag Radweg.pdf', mimetype: 'application/pdf' })
    );
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(originals, { recursive: true, force: true });
});

async function get(query = '?notebookId=n1'): Promise<Response> {
  const { base, close } = await startApp();
  try {
    return await fetch(`${base}/api/documents/d1/original${query}`);
  } finally {
    close();
  }
}

describe('GET /api/documents/:id/original', () => {
  it('serves from an originals dir below a dot directory (e.g. .worktrees)', async () => {
    const dotted = fs.mkdtempSync(path.join(os.tmpdir(), '.dotted-'));
    fs.mkdirSync(path.join(dotted, 'owner-1'));
    fs.writeFileSync(path.join(dotted, 'owner-1/d1.pdf'), '%PDF-1.4 dotted');
    vi.stubEnv('DOCUMENT_ORIGINALS_DIR', dotted);

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('%PDF-1.4 dotted');
    fs.rmSync(dotted, { recursive: true, force: true });
  });

  it('serves the PDF inline to a notebook reader of a foreign document', async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('%PDF-1.4 original');
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(resolveReaderSource).toHaveBeenCalledWith(
      { documentId: 'd1', notebookId: 'n1', userId: 'member-1' },
      expect.anything()
    );
  });

  it('passes no notebook when none is given', async () => {
    resolveReaderSource.mockResolvedValue(null);
    const res = await get('');

    expect(res.status).toBe(404);
    expect(resolveReaderSource).toHaveBeenCalledWith(
      { documentId: 'd1', notebookId: null, userId: 'member-1' },
      expect.anything()
    );
  });

  it('404 for a foreign, trashed or missing document', async () => {
    resolveReaderSource.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Document not found.' });
  });

  it('404 when the document has no kept original', async () => {
    resolveReaderSource.mockResolvedValue(source(null));
    expect((await get()).status).toBe(404);
  });

  it('404 when the file is gone from disk', async () => {
    fs.rmSync(path.join(originals, 'owner-1/d1.pdf'));
    expect((await get()).status).toBe(404);
  });

  it('404 when the stored path escapes the originals dir', async () => {
    resolveReaderSource.mockResolvedValue(
      source({ path: '../../etc/passwd', filename: 'x.pdf', mimetype: null })
    );
    expect((await get()).status).toBe(404);
  });
});

describe('GET /api/documents/:id/original for a scraped system PDF', () => {
  const pdfSource = {
    url: 'https://lv.example/files/Wahlprogramm%202026.pdf',
    fileHash: 'f'.repeat(64),
  };

  beforeEach(() => {
    findSystemPdfSource.mockReset().mockResolvedValue(pdfSource);
    loadSystemOriginal.mockReset();
  });

  it('serves the stored copy with range support, looked up by collection', async () => {
    fs.mkdirSync(path.join(systemMediaRoot, 'scraped-pdf'), { recursive: true });
    fs.writeFileSync(path.join(systemMediaRoot, 'scraped-pdf/f.pdf'), '%PDF-1.7 stored');
    loadSystemOriginal.mockResolvedValue({ kind: 'stored', key: 'scraped-pdf/f.pdf', size: 15 });

    const res = await get('?notebookId=grundsatz-system');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('%PDF-1.7 stored');
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('Wahlprogramm 2026.pdf');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(findSystemPdfSource).toHaveBeenCalledWith('grundsatz_documents', 'd1');
    expect(loadSystemOriginal).toHaveBeenCalledWith(pdfSource);
    expect(resolveReaderSource).not.toHaveBeenCalled();
  });

  it('serves fresh bytes uncached', async () => {
    loadSystemOriginal.mockResolvedValue({ kind: 'fresh', bytes: Buffer.from('%PDF-1.7 fresh') });
    const res = await get('?notebookId=grundsatz-system');
    expect(await res.text()).toBe('%PDF-1.7 fresh');
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('404 when the document has no PDF or the source is gone', async () => {
    findSystemPdfSource.mockResolvedValue(null);
    expect((await get('?notebookId=grundsatz-system')).status).toBe(404);

    findSystemPdfSource.mockResolvedValue(pdfSource);
    loadSystemOriginal.mockRejectedValue(new Error('HTTP 404'));
    expect((await get('?notebookId=grundsatz-system')).status).toBe(404);
  });
});
