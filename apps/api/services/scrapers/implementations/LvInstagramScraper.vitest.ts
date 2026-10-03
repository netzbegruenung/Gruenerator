import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: vi.fn(),
}));
vi.mock('../../../utils/redis/jsonCache.js', () => ({ deleteCachedKey: vi.fn() }));
vi.mock('../../mistral/index.js', () => ({ mistralEmbeddingService: {} }));
vi.mock('../../../config/env.js', () => ({ env: { APIFY_TOKEN: '' } }));

const { buildInstagramPayload, instagramPointId, scrapeLvInstagram } =
  await import('./LvInstagramScraper.js');

const post = {
  url: 'https://www.instagram.com/p/DAbc123/',
  shortCode: 'DAbc123',
  caption: '\nMehr Busse für Vorpommern!\n\nHeute im Landtag …',
  publishedAt: '2026-09-30T10:00:00.000Z',
  imageUrl: 'https://cdn/a.jpg',
  sourceAccount: 'gruenemv',
};

describe('LvInstagramScraper', () => {
  it('derives a stable UUID point id from the post URL', () => {
    const id = instagramPointId(post.url);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(instagramPointId(post.url)).toBe(id);
    expect(instagramPointId('https://www.instagram.com/p/other/')).not.toBe(id);
  });

  it('writes the head-chunk fields every reader of the LV corpus relies on', () => {
    const payload = buildInstagramPayload(
      post,
      'MV',
      'hash',
      '/lv-social/images/DAbc123.webp',
      'now'
    );
    expect(payload).toMatchObject({
      source_url: post.url,
      source_id: 'mv-instagram',
      source_name: 'Instagram @gruenemv',
      landesverband: 'MV',
      source_type: 'landesverband',
      content_type: 'instagram',
      content_type_label: 'Instagram-Post',
      chunk_index: 0,
      full_text: post.caption,
      title: 'Mehr Busse für Vorpommern!',
      published_at: post.publishedAt,
      image_path: '/lv-social/images/DAbc123.webp',
      source_account: 'gruenemv',
    });
    expect(payload).toHaveProperty('embedding_model');
  });

  it('counts a missing APIFY_TOKEN as an error instead of a quiet empty run', async () => {
    const result = await scrapeLvInstagram();
    expect(result.errors).toBe(1);
    expect(result.errorSamples[0]).toContain('APIFY_TOKEN');
  });
});
