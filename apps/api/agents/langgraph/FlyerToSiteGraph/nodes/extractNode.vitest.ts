import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FlyerToSiteState } from '../types.js';

// ─── Module mocks ────────────────────────────────────────────

const mockExtractTextWithDocling = vi.fn();
const mockIsDoclingAvailable = vi.fn();

vi.mock('../../../../services/OcrService/doclingIntegration.js', () => ({
  extractTextWithDocling: (...args: any[]) => mockExtractTextWithDocling(...args),
  isDoclingAvailable: () => mockIsDoclingAvailable(),
}));

const mockExtractTextFromDocument = vi.fn();

vi.mock('../../../../services/OcrService/OcrService.js', () => ({
  OCRService: class MockOCRService {
    extractTextFromDocument = mockExtractTextFromDocument;
  },
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fs to avoid actual file writes in tests
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock('fs', () => ({
  promises: {
    writeFile: (...args: any[]) => mockWriteFile(...args),
    unlink: (...args: any[]) => mockUnlink(...args),
  },
}));

const { extractNode } = await import('./extractNode.js');

// ─── Helpers ─────────────────────────────────────────────────

function makeState(overrides: Partial<FlyerToSiteState> = {}): FlyerToSiteState {
  return {
    pdfBuffer: Buffer.from('fake pdf content'),
    originalFilename: 'test-flyer.pdf',
    email: '',
    req: {},
    extractedText: null,
    extractionResult: null,
    extractTimeMs: 0,
    flyerAnalysis: null,
    analyzeTimeMs: 0,
    websiteContent: null,
    generateTimeMs: 0,
    websiteContentWithImages: null,
    imageTimeMs: 0,
    startTime: Date.now(),
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────

describe('extractNode', () => {
  it('uses Docling when available', async () => {
    mockIsDoclingAvailable.mockResolvedValue(true);
    mockExtractTextWithDocling.mockResolvedValue({
      text: 'Extracted markdown text',
      pageCount: 2,
      method: 'docling',
      confidence: 0.9,
    });

    const result = await extractNode(makeState());

    expect(result.extractedText).toBe('Extracted markdown text');
    expect(result.extractionResult?.method).toBe('docling');
    expect(mockExtractTextWithDocling).toHaveBeenCalled();
    expect(mockExtractTextFromDocument).not.toHaveBeenCalled();
  });

  it('falls back to OCRService when Docling is unavailable', async () => {
    mockIsDoclingAvailable.mockResolvedValue(false);
    mockExtractTextFromDocument.mockResolvedValue({
      text: 'OCR extracted text',
      pageCount: 1,
      method: 'mistral-ocr',
    });

    const result = await extractNode(makeState());

    expect(result.extractedText).toBe('OCR extracted text');
    expect(mockExtractTextWithDocling).not.toHaveBeenCalled();
    expect(mockExtractTextFromDocument).toHaveBeenCalled();
  });

  it('falls back to OCRService when Docling fails', async () => {
    mockIsDoclingAvailable.mockResolvedValue(true);
    mockExtractTextWithDocling.mockRejectedValue(new Error('Docling timeout'));
    mockExtractTextFromDocument.mockResolvedValue({
      text: 'Fallback OCR text',
      pageCount: 1,
      method: 'mistral-ocr',
    });

    const result = await extractNode(makeState());

    expect(result.extractedText).toBe('Fallback OCR text');
  });

  it('returns null extractedText and error when OCR returns empty text', async () => {
    mockIsDoclingAvailable.mockResolvedValue(false);
    mockExtractTextFromDocument.mockResolvedValue({
      text: '   ',
      pageCount: 0,
      method: 'mistral-ocr',
    });

    const result = await extractNode(makeState());

    expect(result.extractedText).toBeNull();
    expect(result.error).toContain('keinen lesbaren Text');
  });

  it('returns error when all extraction methods fail', async () => {
    mockIsDoclingAvailable.mockResolvedValue(false);
    mockExtractTextFromDocument.mockRejectedValue(new Error('OCR failed'));

    const result = await extractNode(makeState());

    expect(result.extractedText).toBeNull();
    expect(result.error).toContain('Textextraktion fehlgeschlagen');
  });

  it('writes temp file and cleans up', async () => {
    mockIsDoclingAvailable.mockResolvedValue(true);
    mockExtractTextWithDocling.mockResolvedValue({
      text: 'text',
      pageCount: 1,
      method: 'docling',
    });

    await extractNode(makeState());

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it('cleans up temp file even on error', async () => {
    mockIsDoclingAvailable.mockResolvedValue(false);
    mockExtractTextFromDocument.mockRejectedValue(new Error('fail'));

    await extractNode(makeState());

    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it('records extractTimeMs', async () => {
    mockIsDoclingAvailable.mockResolvedValue(true);
    mockExtractTextWithDocling.mockResolvedValue({
      text: 'text',
      pageCount: 1,
      method: 'docling',
    });

    const result = await extractNode(makeState());
    expect(result.extractTimeMs).toBeGreaterThanOrEqual(0);
  });
});
