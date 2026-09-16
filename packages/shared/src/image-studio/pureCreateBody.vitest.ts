import { imageFormatIdSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getImageFormat, IMAGE_FORMAT_IDS, IMAGE_FORMATS } from './constants.js';
import { buildPureCreateBody } from './hooks/useKiImageGeneration.js';

describe('buildPureCreateBody', () => {
  it('carries the selected AI label to the request', () => {
    // #3387: the selector offered 'short'/'none' while the request never said
    // so, and the backend defaults a missing kiLabel to the full label.
    expect(
      buildPureCreateBody({ description: 'Ein Park', variant: 'illustration-pure' })
    ).not.toHaveProperty('kiLabel');
    expect(
      buildPureCreateBody({
        description: 'Ein Park',
        variant: 'illustration-pure',
        kiLabel: 'short',
      }).kiLabel
    ).toBe('short');
    expect(
      buildPureCreateBody({
        description: 'Ein Park',
        variant: 'illustration-pure',
        kiLabel: 'none',
      }).kiLabel
    ).toBe('none');
  });

  it('carries the selected format as dimensions', () => {
    const body = buildPureCreateBody({
      description: 'Ein Park',
      variant: 'realistic-pure',
      format: '16:9',
    });

    expect(body).toMatchObject({ prompt: 'Ein Park', variant: 'realistic-pure' });
    expect(body.width).toBe(getImageFormat('16:9').width);
    expect(body.height).toBe(getImageFormat('16:9').height);
  });

  it('omits dimensions without a format so the variant default stands', () => {
    const body = buildPureCreateBody({ description: 'Ein Park', variant: 'pixel-pure' });

    expect(body).not.toHaveProperty('width');
    expect(body).not.toHaveProperty('height');
  });
});

describe('IMAGE_FORMATS', () => {
  // `/imagine/pure` rejects sides that are not multiples of 16 and anything
  // over 4 megapixels, so a bad entry would only surface as a 400 in the UI.
  it.each(IMAGE_FORMATS)('$id stays within what /imagine/pure accepts', (format) => {
    expect(format.width % 16).toBe(0);
    expect(format.height % 16).toBe(0);
    expect(format.width * format.height).toBeLessThanOrEqual(4_000_000);
    expect(format.width).toBeGreaterThanOrEqual(64);
    expect(format.height).toBeGreaterThanOrEqual(64);
  });

  it.each(IMAGE_FORMATS)('$id has the exact ratio its id claims', (format) => {
    const [w, h] = format.id.split(':').map(Number);
    expect(format.width / format.height).toBeCloseTo(w / h, 5);
  });

  it('exposes every id', () => {
    expect(IMAGE_FORMAT_IDS).toEqual(IMAGE_FORMATS.map((f) => f.id));
  });

  // `satisfies` only proves every registry id is a valid wire value. The other
  // direction is what silently breaks: an id in the contract with no registry
  // entry makes getImageFormat() fall back to the first format's dimensions.
  it('covers every id the contract accepts', () => {
    expect([...IMAGE_FORMAT_IDS].sort()).toEqual([...imageFormatIdSchema.options].sort());
  });
});
