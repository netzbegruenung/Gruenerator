import { describe, expect, it, vi } from 'vitest';

import { classifyUpload } from '../uploadImport.js';

describe('classifyUpload', () => {
  it('takes phone videos by their container and keeps the length', () => {
    const streams = [
      { codec_type: 'video', codec_name: 'hevc' },
      { codec_type: 'audio', codec_name: 'aac' },
    ];
    expect(classifyUpload(streams, '61.4', 'IMG_0042.MOV')).toEqual({
      mediaType: 'video',
      mimeType: 'video/quicktime',
      extension: 'mov',
      durationSeconds: 61.4,
    });
  });

  it('reads an mp3 with cover art as audio, not as video', () => {
    const streams = [
      { codec_type: 'audio', codec_name: 'mp3' },
      { codec_type: 'video', codec_name: 'mjpeg' },
    ];
    expect(classifyUpload(streams, '182', 'beat.mp3')).toMatchObject({
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
    });
  });

  it('refuses unknown containers, silent stills and files without a length', () => {
    const video = [{ codec_type: 'video', codec_name: 'h264' }];
    expect(classifyUpload(video, '10', 'clip.mkv')).toBeNull();
    expect(
      classifyUpload([{ codec_type: 'video', codec_name: 'png' }], '1', 'bild.png')
    ).toBeNull();
    expect(classifyUpload(video, undefined, 'clip.mp4')).toBeNull();
  });
});

describe('importUpload', () => {
  it('keeps the upload and fails loudly when ffprobe itself cannot run', async () => {
    const cleanupUploadFiles = vi.fn(async () => undefined);
    vi.doMock('../../subtitler/tusService.js', () => ({
      getUploadStatus: async () => ({ exists: true, metadata: { size: 1 } }),
      getFilePathFromUploadId: () => import.meta.filename,
      getOriginalFilename: async () => 'take.mp4',
      cleanupUploadFiles,
      markUploadAsPromoted: vi.fn(),
    }));
    vi.doMock('../../subtitler/ffmpegWrapper.js', () => ({
      ffprobe: async () => {
        throw Object.assign(new Error('spawn /opt/ffprobe EACCES'), { code: 'EACCES' });
      },
    }));
    vi.doMock('../../sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));
    const { importUpload } = await import('../uploadImport.js');

    await expect(importUpload('user-1', 'abcdef0123456789', null)).rejects.toThrow('EACCES');
    expect(cleanupUploadFiles).not.toHaveBeenCalled();
  });
});
