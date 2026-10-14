import { describe, expect, it } from 'vitest';

import { DEFAULT_IMAGE_SETUP, validateImageSetup } from '../imageSetup.js';

describe('validateImageSetup', () => {
  it('accepts a known style and format', () => {
    expect(validateImageSetup({ style: 'pixel-pure', format: '16:9' })).toEqual({
      ok: true,
      value: { style: 'pixel-pure', format: '16:9' },
    });
  });

  it('rejects anything outside the two lists', () => {
    expect(validateImageSetup({ style: 'watercolor', format: '16:9' }).ok).toBe(false);
    expect(validateImageSetup({ style: 'realistic-pure', format: '2:1' }).ok).toBe(false);
    expect(validateImageSetup(null).ok).toBe(false);
  });

  it('defaults to realistic in the social-post ratio', () => {
    expect(DEFAULT_IMAGE_SETUP).toEqual({ style: 'realistic-pure', format: '4:5' });
  });
});
