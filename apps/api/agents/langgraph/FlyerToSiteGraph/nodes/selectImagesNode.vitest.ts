import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { WebsiteContent } from '../../../../types/routes.js';
import type { FlyerToSiteState } from '../types.js';

// ─── Module mocks ────────────────────────────────────────────

const mockSelectBestImage = vi.fn();

vi.mock('../../../../services/image/ImageSelectionService.js', () => ({
  default: { selectBestImage: (...args: any[]) => mockSelectBestImage(...args) },
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { selectImagesNode } = await import('./selectImagesNode.js');

// ─── Helpers ─────────────────────────────────────────────────

const baseContent: WebsiteContent = {
  hero: { heading: 'Hi', text: 'Welcome' },
  about: { title: 'About', content: 'Bio' },
  hero_image: { title: 'Slogan', subtitle: 'Subtitle' },
  themes: [
    { title: 'Klima', content: 'Klimaschutz' },
    { title: 'Bildung', content: 'Bildungspolitik' },
  ],
  actions: [{ text: 'Mitmachen', link: '#kontakt' }],
  contact: { title: 'Kontakt', email: 'test@example.de' },
};

function makeState(overrides: Partial<FlyerToSiteState> = {}): FlyerToSiteState {
  return {
    pdfBuffer: Buffer.from(''),
    originalFilename: 'flyer.pdf',
    email: '',
    req: { app: { locals: { aiWorkerPool: {} } } },
    extractedText: 'text',
    extractionResult: null,
    extractTimeMs: 0,
    flyerAnalysis: null,
    analyzeTimeMs: 0,
    websiteContent: baseContent,
    generateTimeMs: 0,
    websiteContentWithImages: null,
    imageTimeMs: 0,
    startTime: Date.now(),
    error: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectImagesNode', () => {
  it('returns error when websiteContent is null', async () => {
    const result = await selectImagesNode(makeState({ websiteContent: null }));

    expect(result.websiteContentWithImages).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('assigns images to all sections', async () => {
    mockSelectBestImage.mockResolvedValue({
      selectedImage: { filename: 'image.jpg' },
    });

    const result = await selectImagesNode(makeState());

    expect(result.websiteContentWithImages).toBeDefined();
    expect(result.websiteContentWithImages!.hero_image.imageUrl).toBe(
      '/api/image-picker/stock-image/image.jpg'
    );
    result.websiteContentWithImages!.themes.forEach((theme) => {
      expect(theme.imageUrl).toBe('/api/image-picker/stock-image/image.jpg');
    });
    result.websiteContentWithImages!.actions.forEach((action) => {
      expect(action.imageUrl).toBe('/api/image-picker/stock-image/image.jpg');
    });
    expect(result.websiteContentWithImages!.contact.backgroundImageUrl).toBe(
      '/api/image-picker/stock-image/image.jpg'
    );
  });

  it('calls selectBestImage for each section in parallel', async () => {
    mockSelectBestImage.mockResolvedValue({
      selectedImage: { filename: 'img.jpg' },
    });

    const state = makeState();
    await selectImagesNode(state);

    // hero_image + 2 themes + 1 action + contact = 5 calls
    expect(mockSelectBestImage).toHaveBeenCalledTimes(5);
  });

  it('uses empty string fallback when individual image selection fails', async () => {
    let callCount = 0;
    mockSelectBestImage.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ selectedImage: { filename: 'hero.jpg' } });
      return Promise.reject(new Error('Image picker unavailable'));
    });

    const result = await selectImagesNode(makeState());

    expect(result.websiteContentWithImages).toBeDefined();
    expect(result.websiteContentWithImages!.hero_image.imageUrl).toBe(
      '/api/image-picker/stock-image/hero.jpg'
    );
    // Failed ones get empty string
    result.websiteContentWithImages!.themes.forEach((theme) => {
      expect(theme.imageUrl).toBe('');
    });
  });

  it('preserves original content fields (not just images)', async () => {
    mockSelectBestImage.mockResolvedValue({
      selectedImage: { filename: 'img.jpg' },
    });

    const result = await selectImagesNode(makeState());

    expect(result.websiteContentWithImages!.hero.heading).toBe('Hi');
    expect(result.websiteContentWithImages!.about.content).toBe('Bio');
    expect(result.websiteContentWithImages!.themes[0].title).toBe('Klima');
    expect(result.websiteContentWithImages!.contact.email).toBe('test@example.de');
  });

  it('records imageTimeMs', async () => {
    mockSelectBestImage.mockResolvedValue({
      selectedImage: { filename: 'img.jpg' },
    });

    const result = await selectImagesNode(makeState());
    expect(result.imageTimeMs).toBeGreaterThanOrEqual(0);
  });
});
