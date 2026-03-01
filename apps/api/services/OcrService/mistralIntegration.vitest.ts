/**
 * Tests for Mistral OCR 3 integration
 *
 * Verifies:
 * - Correct document type selection (image vs document URL)
 * - SDK-typed request construction (camelCase, tableFormat)
 * - Response parsing with OCR 3 typed fields (usageInfo.pagesProcessed)
 * - Error handling
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProcess = vi.fn();

vi.mock('../../workers/mistralClient.js', () => ({
  default: {
    ocr: { process: mockProcess },
  },
}));

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-file-content')),
  },
}));

import { extractTextWithMistralOCR } from './mistralIntegration.js';

const getMediaType = (ext: string) => {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
};

const makeOcrResponse = (overrides: Record<string, unknown> = {}) => ({
  pages: [
    { markdown: '# Page 1\nSome content', index: 0, images: [], dimensions: null },
    { markdown: '## Page 2\nMore content', index: 1, images: [], dimensions: null },
  ],
  model: 'mistral-ocr-latest',
  usageInfo: { pagesProcessed: 2, docSizeBytes: 1024 },
  ...overrides,
});

beforeEach(() => {
  mockProcess.mockReset();
});

describe('extractTextWithMistralOCR', () => {
  it('sends document_url for PDF files', async () => {
    mockProcess.mockResolvedValue(makeOcrResponse());

    await extractTextWithMistralOCR('/tmp/test.pdf', getMediaType);

    expect(mockProcess).toHaveBeenCalledOnce();
    const req = mockProcess.mock.calls[0][0];
    expect(req.model).toBe('mistral-ocr-latest');
    expect(req.document.type).toBe('document_url');
    expect(req.document.documentUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(req.tableFormat).toBe('html');
    expect(req.includeImageBase64).toBe(false);
  });

  it('sends image_url for image files', async () => {
    mockProcess.mockResolvedValue(makeOcrResponse());

    await extractTextWithMistralOCR('/tmp/photo.png', getMediaType);

    const req = mockProcess.mock.calls[0][0];
    expect(req.document.type).toBe('image_url');
    expect(req.document.imageUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('sends image_url for all supported image extensions', async () => {
    const imageExts = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.avif',
      '.tiff',
      '.bmp',
      '.heic',
      '.heif',
    ];

    for (const ext of imageExts) {
      mockProcess.mockResolvedValue(makeOcrResponse());
      await extractTextWithMistralOCR(`/tmp/file${ext}`, getMediaType);

      const req = mockProcess.mock.calls.at(-1)![0];
      expect(req.document.type).toBe('image_url');
    }
  });

  it('sends document_url for non-image files', async () => {
    mockProcess.mockResolvedValue(makeOcrResponse());

    await extractTextWithMistralOCR('/tmp/report.docx', getMediaType);

    const req = mockProcess.mock.calls[0][0];
    expect(req.document.type).toBe('document_url');
    expect(req.document.documentUrl).toMatch(/^data:application\/vnd/);
  });

  it('joins multiple pages with separator', async () => {
    mockProcess.mockResolvedValue(makeOcrResponse());

    const result = await extractTextWithMistralOCR('/tmp/test.pdf', getMediaType);

    expect(result.text).toContain('# Page 1');
    expect(result.text).toContain('---');
    expect(result.text).toContain('## Page 2');
  });

  it('returns correct ExtractionResult shape', async () => {
    mockProcess.mockResolvedValue(makeOcrResponse());

    const result = await extractTextWithMistralOCR('/tmp/test.pdf', getMediaType);

    expect(result.method).toBe('mistral-ocr');
    expect(result.pageCount).toBe(2);
    expect(result.confidence).toBe(0.95);
    expect(result.stats?.pages).toBe(2);
    expect(result.stats?.successfulPages).toBe(2);
    expect(result.stats?.method).toBe('mistral-ocr-latest');
  });

  it('filters out empty pages', async () => {
    mockProcess.mockResolvedValue(
      makeOcrResponse({
        pages: [
          { markdown: '# Content', index: 0, images: [], dimensions: null },
          { markdown: '   ', index: 1, images: [], dimensions: null },
          { markdown: 'More text', index: 2, images: [], dimensions: null },
        ],
        usageInfo: { pagesProcessed: 3, docSizeBytes: 512 },
      })
    );

    const result = await extractTextWithMistralOCR('/tmp/test.pdf', getMediaType);

    expect(result.text).not.toContain('   ');
    expect(result.text).toContain('# Content');
    expect(result.text).toContain('More text');
    expect(result.pageCount).toBe(3);
  });

  it('throws when no pages returned', async () => {
    mockProcess.mockResolvedValue({
      pages: [],
      model: 'mistral-ocr-latest',
      usageInfo: { pagesProcessed: 0, docSizeBytes: 0 },
    });

    await expect(extractTextWithMistralOCR('/tmp/test.pdf', getMediaType)).rejects.toThrow(
      'No pages returned from Mistral OCR'
    );
  });

  it('throws when all pages are empty', async () => {
    mockProcess.mockResolvedValue(
      makeOcrResponse({
        pages: [
          { markdown: '', index: 0, images: [], dimensions: null },
          { markdown: '  \n  ', index: 1, images: [], dimensions: null },
        ],
      })
    );

    await expect(extractTextWithMistralOCR('/tmp/test.pdf', getMediaType)).rejects.toThrow(
      'No text extracted from document'
    );
  });

  it('wraps API errors with context', async () => {
    mockProcess.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(extractTextWithMistralOCR('/tmp/test.pdf', getMediaType)).rejects.toThrow(
      'Mistral OCR extraction failed: API rate limit exceeded'
    );
  });
});
