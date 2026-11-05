import { afterEach, describe, expect, it, vi } from 'vitest';

const { log, generateFromPrompt, generateFromImages, loadOwnPhoto, release } = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn() },
  generateFromPrompt: vi.fn(),
  generateFromImages: vi.fn(),
  loadOwnPhoto: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({ createLogger: () => log }));
vi.mock('../flux/index.js', () => ({
  FluxImageService: { create: vi.fn(async () => ({ generateFromPrompt, generateFromImages })) },
}));
vi.mock('../sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ uploadMediaFile: vi.fn(async () => ({ shareToken: 't' })) }),
}));
vi.mock('../trees/index.js', () => ({
  getTreeBudget: () => ({
    reserve: vi.fn(async () => ({ ok: true, status: { day: 'd' } })),
    release,
  }),
  treeBudgetSpentMessage: () => '',
  treeCostForImage: () => 100,
}));
vi.mock('./photoAnalysis.js', () => ({ loadOwnPhoto }));
vi.mock('node:fs', () => ({ default: { readFileSync: () => Buffer.from('') } }));

import { createScenePainter } from './sceneBackground.js';

const scene = { motiv: 'a forest', textSeite: 'unten', format: 'post-portrait' } as const;

describe('createScenePainter', () => {
  afterEach(() => vi.clearAllMocks());

  it('logs how long a painted scene took, so a deadline can come from measurements', async () => {
    generateFromPrompt.mockResolvedValue({ stored: { filePath: 'f' } });
    expect(await createScenePainter('u')(scene)).toEqual({ ok: true, ref: 'ki:t' });
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/^scene painted in \d+ s$/));
  });

  it('logs how long a failed scene took and releases the trees', async () => {
    generateFromPrompt.mockRejectedValue(
      new Error('Polling timed out after 120 seconds (last status: Pending)')
    );
    expect((await createScenePainter('u')(scene)).ok).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /^scene failed after \d+ s: Polling timed out after 120 seconds \(last status: Pending\)$/
      )
    );
    expect(release).toHaveBeenCalledOnce();
  });

  describe('with a person', () => {
    const photos = [
      { id: 'upload:1', url: '/api/share/tok/download', analysis: {} },
    ] as unknown as Parameters<ReturnType<typeof createScenePainter>>[1];

    it('hands the photo to FLUX as the reference image', async () => {
      loadOwnPhoto.mockResolvedValue(Buffer.from('jpegbytes'));
      generateFromImages.mockResolvedValue({ stored: { filePath: 'f' } });
      const result = await createScenePainter('u')({ ...scene, person: 'upload:1' }, photos);
      expect(result).toEqual({ ok: true, ref: 'ki:t' });
      expect(generateFromPrompt).not.toHaveBeenCalled();
      expect(generateFromImages).toHaveBeenCalledWith(
        expect.stringContaining('a forest'),
        [{ buffer: Buffer.from('jpegbytes'), mimeType: 'image/jpeg' }],
        // A person's own photo never leaves the EU endpoint.
        { aspect_ratio: '4:5', euOnly: true }
      );
    });

    it('paints from the prompt alone without a person', async () => {
      generateFromPrompt.mockResolvedValue({ stored: { filePath: 'f' } });
      await createScenePainter('u')(scene);
      expect(generateFromImages).not.toHaveBeenCalled();
      expect(generateFromPrompt).toHaveBeenCalledOnce();
    });

    it('fails without painting when the photo cannot be read', async () => {
      loadOwnPhoto.mockResolvedValue(null);
      const result = await createScenePainter('u')({ ...scene, person: 'upload:1' }, photos);
      expect(result.ok).toBe(false);
      expect(generateFromImages).not.toHaveBeenCalled();
      expect(generateFromPrompt).not.toHaveBeenCalled();
    });
  });
});
