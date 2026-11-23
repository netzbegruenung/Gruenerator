import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMediaFile = vi.fn();
vi.mock('../../../../services/sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ uploadMediaFile }),
}));

const { saveGeneratedImageToMediathek } = await import('./imageMediathek.js');

describe('saveGeneratedImageToMediathek', () => {
  beforeEach(() => {
    uploadMediaFile.mockReset();
  });

  it('files the image as a KI row and returns its share token', async () => {
    uploadMediaFile.mockResolvedValue({ shareToken: 'tok-1' });
    const token = await saveGeneratedImageToMediathek(
      'user-1',
      { base64: Buffer.from('jpeg').toString('base64'), filename: 'a.jpg' },
      'Ein Park voller Bäume'
    );
    expect(token).toBe('tok-1');
    expect(uploadMediaFile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        uploadSource: 'ai_generated',
        mimeType: 'image/jpeg',
        originalFilename: 'a.jpg',
        title: 'Ein Park voller Bäume',
      })
    );
    expect(uploadMediaFile.mock.calls[0][1].fileBuffer.toString()).toBe('jpeg');
  });

  it('returns null instead of throwing when the write fails', async () => {
    uploadMediaFile.mockRejectedValue(new Error('disk full'));
    const token = await saveGeneratedImageToMediathek('u', { base64: '', filename: 'b.jpg' }, 'x');
    expect(token).toBeNull();
  });
});
