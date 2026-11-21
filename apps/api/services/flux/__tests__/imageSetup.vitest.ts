import { describe, expect, it } from 'vitest';

import { DEFAULT_IMAGE_SETUP, validateImageSetup } from '../imageSetup.js';

describe('validateImageSetup', () => {
  it('accepts a known style and format', () => {
    expect(validateImageSetup({ style: 'pixel-pure', format: '16:9' })).toEqual({
      ok: true,
      value: { style: 'pixel-pure', format: '16:9', request: 'new_image' },
    });
  });

  it('keeps an edit request apart from the description of a new image', () => {
    expect(
      validateImageSetup({ style: 'realistic-pure', format: '4:5', request: 'edit_photo' })
    ).toEqual({
      ok: true,
      value: { style: 'realistic-pure', format: '4:5', request: 'edit_photo' },
    });
  });

  it('reads a missing or unknown request as a new image instead of dropping the style', () => {
    expect(validateImageSetup({ style: 'pixel-pure', format: '1:1' })).toEqual({
      ok: true,
      value: { style: 'pixel-pure', format: '1:1', request: 'new_image' },
    });
    expect(
      validateImageSetup({ style: 'pixel-pure', format: '1:1', request: 'retouch' })
    ).toMatchObject({ ok: true, value: { request: 'new_image' } });
  });

  it('rejects anything outside the two lists', () => {
    expect(validateImageSetup({ style: 'watercolor', format: '16:9' }).ok).toBe(false);
    expect(validateImageSetup({ style: 'realistic-pure', format: '2:1' }).ok).toBe(false);
    expect(validateImageSetup(null).ok).toBe(false);
  });

  it('defaults to realistic in the social-post ratio', () => {
    expect(DEFAULT_IMAGE_SETUP).toEqual({
      style: 'realistic-pure',
      format: '4:5',
      request: 'new_image',
    });
  });
});
