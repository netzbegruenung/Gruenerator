import { describe, it, expect, vi, beforeEach } from 'vitest';

const aiText = vi.fn();
vi.mock('../ai/generate.js', () => ({ aiText: (call: unknown) => aiText(call) }));

const { selectCatalogImage } = await import('./selectCatalogImage.js');

const img = (filename: string, tags: string[]) => ({
  filename,
  category: 'x',
  alt_text: filename,
  tags,
});

const images = [
  img('a.jpg', ['city']),
  img('b.jpg', ['train']),
  img('c.jpg', ['solar-energy']),
  img('d.jpg', ['pride']),
  img('e.jpg', ['forest']),
];

describe('selectCatalogImage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    aiText.mockReset();
  });

  it('returns the image the model picked (1-based), wrapped in a code fence or not', async () => {
    aiText.mockResolvedValue('```json\n{"selectedIndex": 3, "confidence": 0.9}\n```');

    const result = await selectCatalogImage('Klimaschutz jetzt', 'quote', images);

    expect(result.selectedImage.filename).toBe('c.jpg');
    expect(result.confidence).toBe(0.9);
    expect(result.selectionMethod).toBe('direct_ai_selection');
    expect(result.alternatives.map((i) => i.filename)).toEqual(['a.jpg', 'b.jpg', 'd.jpg']);
    expect(aiText).toHaveBeenCalledWith(expect.objectContaining({ lane: 'image_picker' }));
  });

  it('defaults the confidence to 0.8 when the model omits it', async () => {
    aiText.mockResolvedValue('{"selectedIndex": 1}');

    const result = await selectCatalogImage('x', 'quote', images);

    expect(result.confidence).toBe(0.8);
  });

  it.each([
    ['unparseable answer', 'Bild 2 passt'],
    ['index out of range', '{"selectedIndex": 99}'],
    ['index zero', '{"selectedIndex": 0}'],
  ])('falls back to keyword matching on %s', async (_label, answer) => {
    aiText.mockResolvedValue(answer);

    const result = await selectCatalogImage('Mehr Bahn für alle', 'quote', images);

    expect(result.selectedImage.filename).toBe('b.jpg');
    expect(result.confidence).toBe(0.6);
    expect(result.selectionMethod).toBe('smart_fallback');
    expect(result.alternatives.map((i) => i.filename)).toEqual(['a.jpg', 'c.jpg', 'd.jpg']);
  });

  it('falls back to the first image when the matched theme has no tagged image', async () => {
    aiText.mockResolvedValue('nope');

    const result = await selectCatalogImage('Europa stärken', 'quote', images);

    expect(result.selectedImage.filename).toBe('a.jpg');
  });

  it('throws when the model call fails', async () => {
    aiText.mockRejectedValue(new Error('provider down'));

    await expect(selectCatalogImage('x', 'quote', images)).rejects.toThrow('provider down');
  });

  it('throws on an empty catalog without calling the model', async () => {
    await expect(selectCatalogImage('x', 'quote', [])).rejects.toThrow(
      'No images available for fallback'
    );
    expect(aiText).not.toHaveBeenCalled();
  });
});
