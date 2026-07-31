/**
 * The two rules that made this module necessary, pinned:
 *
 *  - image hits leave the tool result BEFORE the lean `{resultCount, sources}`
 *    shape is built (they used to be dropped there, which is why `bilder: true`
 *    bought nothing on the loop path), and
 *  - what goes back to the model is a count and a licence constraint, never a
 *    URL — a hotlink in the prose is the third-party request the image proxy
 *    exists to prevent.
 */

import { describe, it, expect } from 'vitest';

import { harvestSearchImages, imageDeliveryNote, MAX_TURN_IMAGES } from './searchImageHarvest.js';

const img = (n: number) => ({
  title: `Bild ${n}`,
  url: `https://example.test/${n}.jpg`,
  domain: 'example.test',
});

describe('harvestSearchImages', () => {
  it('takes the images off a web_search result', () => {
    const { images, added } = harvestSearchImages(
      { resultsCount: 2, results: [{}, {}], images: [img(1), img(2)] },
      []
    );
    expect(added).toBe(2);
    expect(images.map((i) => i.url)).toEqual([
      'https://example.test/1.jpg',
      'https://example.test/2.jpg',
    ]);
  });

  it('accumulates across the searches of one loop turn', () => {
    const first = harvestSearchImages({ images: [img(1)] }, []);
    const second = harvestSearchImages({ images: [img(2)] }, first.images);
    expect(second.added).toBe(1);
    expect(second.images).toHaveLength(2);
  });

  it('keeps the first occurrence of a repeated URL', () => {
    const first = harvestSearchImages({ images: [{ ...img(1), title: 'Original' }] }, []);
    const second = harvestSearchImages(
      { images: [{ ...img(1), title: 'Zweitfund' }] },
      first.images
    );
    expect(second.added).toBe(0);
    expect(second.images).toHaveLength(1);
    expect(second.images[0]?.title).toBe('Original');
  });

  it('caps the turn — a loop that searches four times must not carry 32 thumbnails', () => {
    const many = Array.from({ length: 20 }, (_, i) => img(i));
    const { images } = harvestSearchImages({ images: many }, []);
    expect(images).toHaveLength(MAX_TURN_IMAGES);
  });

  it('returns the SAME list when nothing was added, so the caller can skip the send', () => {
    const collected = [img(1)];
    const { images, added } = harvestSearchImages({ results: [] }, collected);
    expect(added).toBe(0);
    expect(images).toBe(collected);
  });

  it('drops entries without a usable URL — a link is all we do with one', () => {
    const { images, added } = harvestSearchImages(
      { images: [{ title: 'kaputt' }, { title: 'leer', url: '   ' }, img(3)] },
      []
    );
    expect(added).toBe(1);
    expect(images[0]?.url).toBe('https://example.test/3.jpg');
  });

  it('survives a tool result of the wrong shape', () => {
    expect(harvestSearchImages(null, []).added).toBe(0);
    expect(harvestSearchImages('nope', []).added).toBe(0);
    expect(harvestSearchImages({ images: 'nope' }, []).added).toBe(0);
    expect(harvestSearchImages({ images: [null, 42] }, []).added).toBe(0);
  });
});

describe('imageDeliveryNote', () => {
  it('is empty when nothing was found, so no prompt budget is spent', () => {
    expect(imageDeliveryNote(0)).toBe('');
    expect(imageDeliveryNote(-1)).toBe('');
  });

  it('gives the model a count and never a URL', () => {
    const note = imageDeliveryNote(3);
    expect(note).toContain('3 Bildtreffer');
    expect(note).not.toMatch(/https?:\/\//);
  });

  it('states the licence constraint — the answer must not imply the images are ours to use', () => {
    const note = imageDeliveryNote(2);
    expect(note).toContain('Recherchematerial');
    expect(note).toMatch(/frei nutzbar/i);
    expect(note).toMatch(/Sharepics/i);
  });
});
