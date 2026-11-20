import { describe, expect, it } from 'vitest';

import * as shared from '../../../../packages/shared/src/media-library/constants.js';

import * as api from './uploadLimits.js';

describe('Mediathek upload limits', () => {
  it('match the limits the web client checks before uploading', () => {
    expect(api.MAX_IMAGE_SIZE).toBe(shared.MAX_IMAGE_SIZE);
    expect(api.MAX_VIDEO_SIZE).toBe(shared.MAX_VIDEO_SIZE);
    expect(api.maxUploadBytesFor('video/mp4')).toBe(shared.maxUploadBytesFor('video/mp4'));
    expect(api.formatUploadLimit(api.MAX_VIDEO_SIZE)).toBe('2 GB');
    expect(api.formatUploadLimit(api.MAX_IMAGE_SIZE)).toBe('50 MB');
  });
});
