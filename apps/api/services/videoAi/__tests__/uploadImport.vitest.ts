import { describe, expect, it } from 'vitest';

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
