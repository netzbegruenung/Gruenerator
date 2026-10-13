import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const mockQuery = vi.fn();
const mockExtractText = vi.fn();
const mockSeed = vi.fn();

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));
vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: () => void) => next(),
}));
vi.mock('../../services/OcrService/index.js', () => ({
  ocrService: { extractTextFromBase64: (...args: unknown[]) => mockExtractText(...args) },
}));
vi.mock('../../services/docs/seedYjsState.js', () => ({
  seedYjsStateSafe: (...args: unknown[]) => mockSeed(...args),
}));
vi.mock('../../services/sync/index.js', () => ({ getWolkeSyncService: vi.fn() }));
vi.mock('../../services/api-clients/nextcloudApiClient.js', () => ({ default: {} }));

const { default: router } = await import('./importController.js');

const layer = router.stack.find(
  (l: any) => l.route?.path === '/from-import' && l.route?.methods?.post
);
const handler = layer!.route!.stack.at(-1)!.handle as (req: any, res: Response) => Promise<void>;

function call(file: { originalname: string; mimetype: string; content: string }) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const buffer = Buffer.from(file.content, 'utf8');
  return handler(
    { user: { id: 'u1' }, file: { ...file, buffer, size: buffer.length } },
    res as unknown as Response
  ).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([{ id: 'doc-1' }]);
});

describe('POST /from-import — Textdateien', () => {
  it('importiert .md ohne OCR, auch bei leerem MIME-Typ', async () => {
    const res = await call({
      originalname: 'Beschluss.md',
      mimetype: 'application/octet-stream',
      content: '# Klimaplan\n\nText',
    });

    expect(mockExtractText).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1', url: '/office/doc-1', success: true })
    );
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('Klimaplan');
    expect(params[1]).toContain('<h1>Klimaplan</h1>');
    expect(mockSeed).toHaveBeenCalledWith('doc-1', params[1], 'DocsImport');
  });

  it('nimmt für .txt den Dateinamen als Titel und maskiert HTML', async () => {
    const res = await call({
      originalname: 'Sitzungs_notiz.txt',
      mimetype: 'text/plain',
      content: 'erste Zeile <script>x</script>',
    });

    expect(res.status).toHaveBeenCalledWith(201);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('Sitzungs notiz');
    expect(params[1]).toBe('<p>erste Zeile &lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('weist eine leere Textdatei mit 422 ab, ohne Dokument anzulegen', async () => {
    const res = await call({ originalname: 'leer.txt', mimetype: 'text/plain', content: ' \n ' });

    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lehnt weiterhin unbekannte Formate ab', async () => {
    const res = await call({
      originalname: 'x.exe',
      mimetype: 'application/x-msdownload',
      content: 'x',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
