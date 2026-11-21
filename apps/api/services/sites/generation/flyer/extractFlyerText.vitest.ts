import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ocr: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
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
  it('reads through OCRService with page markers and strips them', async () => {
    mocks.ocr.mockResolvedValue({
      text: '## Seite 1\n\n Kandidatin Anna \n\n## Seite 2\n\nTermine',
    });
    await expect(extractFlyerText(pdf)).resolves.toBe('Kandidatin Anna \n\nTermine');
    expect(mocks.ocr).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), undefined, {
      pageMarkers: true,
    });
  });

  it('returns an empty string when nothing is readable', async () => {
    mocks.ocr.mockResolvedValue({ text: '   ' });
    await expect(extractFlyerText(pdf)).resolves.toBe('');
  });

  it('throws when extraction fails', async () => {
    mocks.ocr.mockRejectedValue(new Error('OCR failed'));
    await expect(extractFlyerText(pdf)).rejects.toThrow('flyer extraction failed');
  });

  it('writes the temp file with a fixed .pdf extension', async () => {
    mocks.ocr.mockResolvedValue({ text: 'x' });
    await extractFlyerText(pdf);
    const target = mocks.writeFile.mock.calls[0]?.[0] as string;
    expect(target.endsWith('.pdf')).toBe(true);
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
  });

  it('cleans up the temp file on error', async () => {
    mocks.ocr.mockRejectedValue(new Error('fail'));
    await extractFlyerText(pdf).catch(() => {});
    expect(mocks.unlink).toHaveBeenCalledTimes(1);
  });
});
