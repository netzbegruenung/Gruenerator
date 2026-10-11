import { describe, expect, it } from 'vitest';

import {
  acceptForMediaType,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_MIME_LABEL,
  SUPPORTED_MIME_TYPES,
} from './constants.js';

describe('media upload constants', () => {
  it('names every accepted type in the validation message', () => {
    expect(SUPPORTED_MIME_LABEL).toBe('JPEG, PNG, WebP, GIF, MP4, WebM, MOV');
    expect(SUPPORTED_MIME_LABEL.split(', ')).toHaveLength(SUPPORTED_MIME_TYPES.length);
  });

  it('narrows the file picker to the asked type, and never offers audio', () => {
    expect(acceptForMediaType('image')).toBe(SUPPORTED_IMAGE_TYPES.join(','));
    expect(acceptForMediaType('video')).toBe('video/mp4,video/webm,video/quicktime');
    // The API takes no audio uploads; an audio picker falls back to what it does take.
    expect(acceptForMediaType('audio')).toBe(SUPPORTED_MIME_TYPES.join(','));
    expect(acceptForMediaType()).toBe(SUPPORTED_MIME_TYPES.join(','));
  });
});
