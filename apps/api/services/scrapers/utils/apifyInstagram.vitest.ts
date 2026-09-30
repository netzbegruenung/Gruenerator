import { describe, expect, it } from 'vitest';

import { toInstagramPost } from './apifyInstagram.js';

const CAPTION = 'Heute im Landtag: mehr Busse für den ländlichen Raum.';

describe('toInstagramPost', () => {
  it('maps an Apify row with display image', () => {
    expect(
      toInstagramPost(
        {
          shortCode: 'DAbc123',
          url: 'https://www.instagram.com/p/DAbc123/',
          caption: CAPTION,
          timestamp: '2026-09-30T10:00:00.000Z',
          displayUrl: 'https://scontent.cdninstagram.com/a.jpg',
        },
        'gruene_berlin'
      )
    ).toEqual({
      url: 'https://www.instagram.com/p/DAbc123/',
      shortCode: 'DAbc123',
      caption: CAPTION,
      publishedAt: '2026-09-30T10:00:00.000Z',
      imageUrl: 'https://scontent.cdninstagram.com/a.jpg',
      sourceAccount: 'gruene_berlin',
    });
  });

  it('falls back to the first carousel image and builds the URL from the short code', () => {
    const post = toInstagramPost(
      { code: 'X1', text: CAPTION, images: ['https://cdn/1.jpg', 'https://cdn/2.jpg'] },
      'h'
    );
    expect(post).toMatchObject({
      url: 'https://www.instagram.com/p/X1/',
      imageUrl: 'https://cdn/1.jpg',
      publishedAt: null,
    });
  });

  it('keeps a post without any image', () => {
    expect(toInstagramPost({ shortCode: 'A', caption: CAPTION }, 'h')?.imageUrl).toBeNull();
  });

  it('drops rows without short code or with a too short caption', () => {
    expect(
      toInstagramPost({ url: 'https://www.instagram.com/p/A/', caption: CAPTION }, 'h')
    ).toBeNull();
    expect(toInstagramPost({ shortCode: 'A', caption: '#gruen' }, 'h')).toBeNull();
  });
});
