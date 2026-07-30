/**
 * Linkup returns image hits INSIDE the same array as the text hits, marked
 * `type: 'image'` and carrying no `content`. The `type` field sat on the result
 * shape unread for as long as nothing asked for images — the moment something
 * does, an unsplit mapping walks content-less entries into the source registry,
 * where they become numbered citations backing claims with an empty snippet.
 *
 * These tests pin the split, not the flag: the hazard is the mapping, and it is
 * one forgotten `type` check away from returning.
 */

import { describe, it, expect } from 'vitest';

import { partitionLinkupResults } from './directSearchExecutors.js';

import { type LinkupSearchResult } from '../../../services/search/LinkupService.js';

function hit(over: Partial<LinkupSearchResult>): LinkupSearchResult {
  return { name: 'Titel', url: 'https://example.org/a', content: 'Text', ...over };
}

describe('partitionLinkupResults', () => {
  it('keeps image entries out of the text results', () => {
    const { text, images } = partitionLinkupResults([
      hit({ url: 'https://zeit.de/a' }),
      hit({ type: 'image', url: 'https://zeit.de/bild.jpg', content: '' }),
      hit({ url: 'https://spiegel.de/b' }),
    ]);
    expect(text.map((r) => r.url)).toEqual(['https://zeit.de/a', 'https://spiegel.de/b']);
    expect(images.map((r) => r.url)).toEqual(['https://zeit.de/bild.jpg']);
  });

  it('treats an unmarked entry as text', () => {
    // No `type` at all is the common case — every hit before images existed.
    const { text, images } = partitionLinkupResults([hit({})]);
    expect(text).toHaveLength(1);
    expect(images).toHaveLength(0);
  });

  it('treats an unknown type as text rather than dropping it', () => {
    // Classification is by exclusion: a future `type: 'video'` still carries
    // content, so keeping it as a source beats silently losing it.
    const { text, images } = partitionLinkupResults([hit({ type: 'video' })]);
    expect(text).toHaveLength(1);
    expect(images).toHaveLength(0);
  });

  it('drops an image entry without a usable url', () => {
    // A link is the only thing we do with an image hit.
    const { images } = partitionLinkupResults([
      hit({ type: 'image', url: '', content: '' }),
      hit({ type: 'image', url: '   ', content: '' }),
    ]);
    expect(images).toHaveLength(0);
  });

  it('returns empty lists for an empty response', () => {
    expect(partitionLinkupResults([])).toEqual({ text: [], images: [] });
  });

  it('preserves the engine order within each list', () => {
    // Text rank drives the synthetic relevance downstream, so order is not
    // cosmetic — a reshuffle here would silently reorder the citations.
    const { text } = partitionLinkupResults([
      hit({ url: 'https://a.de' }),
      hit({ type: 'image', url: 'https://img.de/1.jpg', content: '' }),
      hit({ url: 'https://b.de' }),
      hit({ url: 'https://c.de' }),
    ]);
    expect(text.map((r) => r.url)).toEqual(['https://a.de', 'https://b.de', 'https://c.de']);
  });
});
