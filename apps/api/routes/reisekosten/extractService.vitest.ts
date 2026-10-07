/**
 * Two ways in: text the browser read from a text PDF goes straight to the
 * model (no OCR — the file never left the device); a scan or photo goes
 * through OCR first, with page markers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const extractTextFromBase64 = vi.fn();
const generateObject = vi.fn();

vi.mock('../../services/OcrService/index.js', () => ({ ocrService: { extractTextFromBase64 } }));
vi.mock('../../services/ai/providers.js', () => ({ getIntermediateModel: () => 'model' }));
vi.mock('ai', () => ({ generateObject }));

const { extractBeleg } = await import('./extractService.js');

const OBJECT = {
  kategorie: 'db_rechnung',
  betrag: 64.9,
  datum: '2026-10-01',
  von: 'Köln Hbf',
  nach: 'Düsseldorf Hbf',
  businessPackage: true,
};

beforeEach(() => {
  extractTextFromBase64.mockReset();
  generateObject.mockReset();
  generateObject.mockResolvedValue({ object: OBJECT });
});

describe('extractBeleg', () => {
  it('sends browser-extracted text to the model without OCR', async () => {
    const result = await extractBeleg({ text: 'DB Rechnung 64,90 EUR', filename: 'r.pdf' });

    expect(extractTextFromBase64).not.toHaveBeenCalled();
    expect(generateObject.mock.calls[0]?.[0].prompt).toContain('DB Rechnung 64,90 EUR');
    expect(result.quelle).toBe('server-text');
    expect(result.kategorie).toBe('db_rechnung');
    expect(result.betrag).toBe(64.9);
  });

  it('OCRs a scan with page markers, then asks the model', async () => {
    extractTextFromBase64.mockResolvedValue({ text: '## Seite 1\nHotel Rechnung' });
    generateObject.mockResolvedValue({ object: { ...OBJECT, kategorie: 'hotelrechnung' } });

    const result = await extractBeleg({
      base64: 'AAAA',
      filename: 'scan.pdf',
      mimeType: 'application/pdf',
    });

    expect(extractTextFromBase64).toHaveBeenCalledWith('AAAA', 'scan.pdf', 'application/pdf', {
      pageMarkers: true,
    });
    expect(generateObject.mock.calls[0]?.[0].prompt).toContain('Hotel Rechnung');
    expect(result.quelle).toBe('server-ocr');
    expect(result.businessPackage).toBe(true);
  });

  it('keeps businessPackage null outside hotel invoices', async () => {
    const result = await extractBeleg({ text: 'x', filename: 'r.pdf' });
    expect(result.businessPackage).toBeNull();
  });

  it('lists every category in the system prompt', async () => {
    const { belegKategorieSchema } = await import('@gruenerator/contracts');
    await extractBeleg({ text: 'x', filename: 'r.pdf' });
    const system = generateObject.mock.calls[0]?.[0].system as string;
    for (const k of belegKategorieSchema.options) expect(system).toContain(`- ${k}:`);
  });
});
