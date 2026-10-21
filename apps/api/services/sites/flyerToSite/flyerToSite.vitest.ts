import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Request } from 'express';

const extractNode = vi.fn();
const analyzeNode = vi.fn();
const generateNode = vi.fn();
const selectImagesNode = vi.fn();

vi.mock('./nodes/extractNode.js', () => ({ extractNode: (s: unknown) => extractNode(s) }));
vi.mock('./nodes/analyzeNode.js', () => ({ analyzeNode: (s: unknown) => analyzeNode(s) }));
vi.mock('./nodes/generateNode.js', () => ({ generateNode: (s: unknown) => generateNode(s) }));
vi.mock('./nodes/selectImagesNode.js', () => ({
  selectImagesNode: (s: unknown) => selectImagesNode(s),
}));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { runFlyerToSite } = await import('./flyerToSite.js');

const input = {
  pdfBuffer: Buffer.from('pdf'),
  originalFilename: 'flyer.pdf',
  req: {} as Request,
};

describe('runFlyerToSite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops after extraction when no text was found', async () => {
    extractNode.mockResolvedValue({
      extractedText: null,
      extractionResult: null,
      extractTimeMs: 12,
      error: 'Der Flyer enthält keinen lesbaren Text.',
    });

    const result = await runFlyerToSite(input);

    expect(analyzeNode).not.toHaveBeenCalled();
    expect(generateNode).not.toHaveBeenCalled();
    expect(selectImagesNode).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      json: null,
      error: 'Der Flyer enthält keinen lesbaren Text.',
      metadata: {
        filename: 'flyer.pdf',
        extractTimeMs: 12,
        analyzeTimeMs: 0,
        generateTimeMs: 0,
        imageTimeMs: 0,
        ocrMethod: 'none',
        extractedTextLength: 0,
      },
    });
  });

  it('runs every step in order and threads state through', async () => {
    const content = { hero: { heading: 'Hi' } };
    const withImages = { ...content, withImages: true };
    extractNode.mockResolvedValue({
      extractedText: 'Flyertext',
      extractionResult: { method: 'docling' },
      extractTimeMs: 1,
    });
    analyzeNode.mockResolvedValue({ flyerAnalysis: { name: 'Kim' }, analyzeTimeMs: 2 });
    generateNode.mockResolvedValue({ websiteContent: content, generateTimeMs: 3 });
    selectImagesNode.mockResolvedValue({ websiteContentWithImages: withImages, imageTimeMs: 4 });

    const result = await runFlyerToSite({ ...input, email: 'kim@example.org' });

    expect(analyzeNode.mock.calls[0]![0]).toMatchObject({
      extractedText: 'Flyertext',
      email: 'kim@example.org',
    });
    expect(generateNode.mock.calls[0]![0]).toMatchObject({ flyerAnalysis: { name: 'Kim' } });
    expect(selectImagesNode.mock.calls[0]![0]).toMatchObject({ websiteContent: content });
    expect(result).toMatchObject({
      success: true,
      json: withImages,
      metadata: {
        extractTimeMs: 1,
        analyzeTimeMs: 2,
        generateTimeMs: 3,
        imageTimeMs: 4,
        ocrMethod: 'docling',
        extractedTextLength: 9,
      },
    });
  });

  it('reports the generation error when no content came out', async () => {
    extractNode.mockResolvedValue({ extractedText: 'Text', extractTimeMs: 1 });
    analyzeNode.mockResolvedValue({ flyerAnalysis: { name: 'Kim' }, analyzeTimeMs: 2 });
    generateNode.mockResolvedValue({
      websiteContent: null,
      generateTimeMs: 3,
      error: 'Website-Generierung fehlgeschlagen: kaputt',
    });
    selectImagesNode.mockImplementation((s: { error: string | null }) =>
      Promise.resolve({ websiteContentWithImages: null, imageTimeMs: 0, error: s.error })
    );

    const result = await runFlyerToSite(input);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Website-Generierung fehlgeschlagen: kaputt');
  });
});
