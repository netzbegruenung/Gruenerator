import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeBackgroundWithRembg = vi.hoisted(() => vi.fn(async () => Buffer.from('png')));
const media = vi.hoisted(() => ({
  uploadMediaFile: vi.fn(async () => ({ shareToken: 'cutout-token-000001' })),
  getShareByToken: vi.fn(async () => ({ status: 'ready' })),
}));
vi.mock('../image/rembgIntegration.js', () => ({ removeBackgroundWithRembg }));
vi.mock('../sharedMediaService.js', () => ({ getSharedMediaService: () => media }));

import { createCutOutPainter } from './cutOut.js';

const STOCK = 'diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg';

describe('createCutOutPainter', () => {
  beforeEach(() => {
    removeBackgroundWithRembg.mockClear();
    media.uploadMediaFile.mockClear();
  });

  it('cuts a stock photo once per user and reuses the stored cut-out', async () => {
    const cut = createCutOutPainter('user-a');
    expect(await cut(STOCK)).toBe('ki:cutout-token-000001');
    expect(await cut(STOCK)).toBe('ki:cutout-token-000001');
    expect(removeBackgroundWithRembg).toHaveBeenCalledTimes(1);
    expect(media.uploadMediaFile).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ mimeType: 'image/png' })
    );
    // Another person gets a cut-out in their own library.
    await createCutOutPainter('user-b')(STOCK);
    expect(removeBackgroundWithRembg).toHaveBeenCalledTimes(2);
  });

  it('cuts again when the stored cut-out is gone', async () => {
    const cut = createCutOutPainter('user-c');
    await cut(STOCK);
    media.getShareByToken.mockResolvedValueOnce(null as never);
    await cut(STOCK);
    expect(removeBackgroundWithRembg).toHaveBeenCalledTimes(2);
  });

  it('reads no file the catalogue does not name, and fails soft', async () => {
    const cut = createCutOutPainter('user-d');
    expect(await cut('../../../etc/passwd.jpg')).toBeNull();
    expect(await cut('upload:1')).toBeNull();
    removeBackgroundWithRembg.mockRejectedValueOnce(new Error('rembg down'));
    expect(await cut(STOCK)).toBeNull();
    expect(removeBackgroundWithRembg).toHaveBeenCalledTimes(1);
  });
});
