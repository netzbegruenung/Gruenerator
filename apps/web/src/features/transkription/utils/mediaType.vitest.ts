import { describe, expect, it } from 'vitest';

import { isVideoUpload, uploadMediaType } from './mediaType';

const file = (name: string, type: string) => new File([new Uint8Array(1)], name, { type });

describe('uploadMediaType', () => {
  it('trusts the browser when it knows the type', () => {
    expect(uploadMediaType(file('a.mp3', 'audio/mpeg'))).toBe('audio/mpeg');
  });

  // An 800 MB .mkv without a browser type used to be treated as audio and
  // rejected at the 500 MB audio limit.
  it('falls back to the extension for videos without a browser type', () => {
    expect(uploadMediaType(file('Sitzung.MKV', ''))).toBe('video/x-matroska');
    expect(isVideoUpload(file('clip.webm', ''))).toBe(true);
  });

  it('leaves unknown extensions untyped, so they stay on the audio limit', () => {
    expect(isVideoUpload(file('aufnahme.wav', ''))).toBe(false);
    expect(isVideoUpload(file('ohne-endung', ''))).toBe(false);
  });
});
