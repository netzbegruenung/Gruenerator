import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docling: vi.fn(),
  doclingUp: vi.fn(),
  ocr: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../OcrService/doclingIntegration.js', () => ({
  extractTextWithDocling: (...args: unknown[]) => mocks.docling(...args),
  isDoclingAvailable: () => mocks.doclingUp(),
}));
vi.mock('../../../OcrService/index.js', () => ({
  OCRService: class {
    extractTextFromDocument = mocks.ocr;
  },
}));
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('fs', () => ({
  promises: {
    writeFile: (...args: unknown[]) => mocks.writeFile(...args),
    unlink: (...args: unknown[]) => mocks.unlink(...args),
  },
}));

const { extractFlyerText } = await import('./extractFlyerText.js');

const pdf = Buffer.from('%PDF-1.7 fake');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractFlyerText', () => {
  it('uses Docling when available', async () => {
    mocks.doclingUp.mockResolvedValue(true);
    mocks.docling.mockResolvedValue({ text: ' Docling text \n' });
    await expect(extractFlyerText(pdf)).resolves.toBe('Docling text');
    expect(mocks.ocr).not.toHaveBeenCalled();
  });

  it('falls back to OCRService when Docling is unavailable', async () => {
    mocks.doclingUp.mockResolvedValue(false);
    mocks.ocr.mockResolvedValue({ text: 'OCR text' });
    await expect(extractFlyerText(pdf)).resolves.toBe('OCR text');
    expect(mocks.docling).not.toHaveBeenCalled();
  });

  it('falls back to OCRService when Docling fails', async () => {
    mocks.doclingUp.mockResolvedValue(true);
    mocks.docling.mockRejectedValue(new Error('timeout'));
    mocks.ocr.mockResolvedValue({ text: 'Fallback' });
    await expect(extractFlyerText(pdf)).resolves.toBe('Fallback');
  });

  it('returns an empty string when nothing is readable', async () => {
    mocks.doclingUp.mockResolvedValue(false);
    mocks.ocr.mockResolvedValue({ text: '   ' });
    await expect(extractFlyerText(pdf)).resolves.toBe('');
  });

  it('throws when every extractor fails', async () => {
    mocks.doclingUp.mockResolvedValue(false);
    mocks.ocr.mockRejectedValue(new Error('OCR failed'));
    await expect(extractFlyerText(pdf)).rejects.toThrow('flyer extraction failed');
  });

  it('writes the temp file with a fixed .pdf extension', async () => {
    mocks.doclingUp.mockResolvedValue(true);
    mocks.docling.mockResolvedValue({ text: 'x' });
    await extractFlyerText(pdf);
    const target = mocks.writeFile.mock.calls[0]?.[0] as string;
    expect(target.endsWith('.pdf')).toBe(true);
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
  });

  it('cleans up the temp file on error', async () => {
    mocks.doclingUp.mockResolvedValue(false);
    mocks.ocr.mockRejectedValue(new Error('fail'));
    await extractFlyerText(pdf).catch(() => {});
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
  });
});
