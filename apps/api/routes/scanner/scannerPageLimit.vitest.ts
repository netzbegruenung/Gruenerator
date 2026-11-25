/**
 * The 20-page limit has to hold BEFORE extraction: a scanned PDF goes to a
 * provider billed per page, and rejecting it afterwards meant paying for a
 * 150-page OCR run whose result was thrown away (#3617).
 */
import { type AddressInfo } from 'net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const extractTextFromDocument = vi.fn();
const getPDFInfo = vi.fn();

vi.mock('../../middleware/authMiddleware.js', () => ({
  default: { requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() },
}));
vi.mock('../../middleware/requireAiConsent.js', () => ({
  requireAiConsent: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/OcrService/index.js', () => ({
  ocrService: { extractTextFromDocument, getPDFInfo },
}));

const { default: scannerRouter } = await import('./index.js');

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

beforeAll(async () => {
  const app = express();
  app.use('/api/scanner', scannerRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  extractTextFromDocument.mockReset();
  getPDFInfo.mockReset();
});

function postPdf(): Promise<Response> {
  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'scan.pdf');
  return fetch(`${baseUrl}/api/scanner/extract`, { method: 'POST', body: form });
}

describe('POST /api/scanner/extract page limit', () => {
  it('rejects an oversized PDF without extracting it', async () => {
    getPDFInfo.mockResolvedValue({ pageCount: 150 });

    const res = await postPdf();

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('150 Seiten');
    expect(extractTextFromDocument).not.toHaveBeenCalled();
  });

  it('still extracts a PDF that pdf.js cannot open', async () => {
    getPDFInfo.mockRejectedValue(new Error('Invalid PDF structure'));
    extractTextFromDocument.mockResolvedValue({ text: 'Hallo', pageCount: 1 });

    const res = await postPdf();

    expect(res.status).toBe(200);
    expect(extractTextFromDocument).toHaveBeenCalledTimes(1);
  });
});
