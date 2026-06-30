import { describe, expect, it } from 'vitest';

import { pushDeleteBodySchema, pushIngestBodySchema } from '@gruenerator/contracts';

import { generateLvPointId } from './documentProcessorFactory.js';

/**
 * Reference implementation of the deterministic LV point id, kept here on
 * purpose: if the production `generateLvPointId` is edited, this independent copy
 * still encodes the original djb2-style algorithm and the parity test below
 * fails — guarding the invariant that push and scrape address the same points.
 */
function referencePointId(url: string, chunkIndex: number): number {
  const combined = `lv_${url}_${chunkIndex}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const baseArticle = {
  title: 'Grüne fordern mehr Tempo beim Klimaschutz',
  contentText: 'x'.repeat(150),
  sourceUrl: 'https://gruene-lsa.de/presse/klima',
  categories: ['Pressemitteilungen'],
};

describe('pushIngestBodySchema', () => {
  it('accepts a valid landesverband article', () => {
    const parsed = pushIngestBodySchema.safeParse({
      target: 'landesverband',
      sourceId: 'sachsen-anhalt-lv',
      contentType: 'presse',
      ...baseArticle,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid notebook article', () => {
    const parsed = pushIngestBodySchema.safeParse({
      target: 'notebook',
      notebookId: 'my-notes-Ab3xK9',
      ...baseArticle,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown content type (closed enum)', () => {
    const parsed = pushIngestBodySchema.safeParse({
      target: 'landesverband',
      sourceId: 'sachsen-anhalt-lv',
      contentType: 'newsletter',
      ...baseArticle,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects content shorter than the chunker floor', () => {
    const parsed = pushIngestBodySchema.safeParse({
      target: 'notebook',
      notebookId: 'n1',
      ...baseArticle,
      contentText: 'too short',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing target discriminator', () => {
    const parsed = pushIngestBodySchema.safeParse({ sourceId: 'x', ...baseArticle });
    expect(parsed.success).toBe(false);
  });

  it('defaults categories to an empty array', () => {
    const parsed = pushIngestBodySchema.parse({
      target: 'notebook',
      notebookId: 'n1',
      title: baseArticle.title,
      contentText: baseArticle.contentText,
      sourceUrl: baseArticle.sourceUrl,
    });
    expect(parsed.categories).toEqual([]);
  });
});

describe('pushDeleteBodySchema', () => {
  it('accepts a landesverband delete', () => {
    expect(
      pushDeleteBodySchema.safeParse({
        target: 'landesverband',
        sourceId: 'sachsen-anhalt-lv',
        sourceUrl: 'https://gruene-lsa.de/presse/klima',
      }).success
    ).toBe(true);
  });

  it('rejects a non-url sourceUrl', () => {
    expect(
      pushDeleteBodySchema.safeParse({
        target: 'notebook',
        notebookId: 'n1',
        sourceUrl: 'not-a-url',
      }).success
    ).toBe(false);
  });
});

describe('generateLvPointId', () => {
  it('is deterministic and matches the reference algorithm (push/scrape parity)', () => {
    const cases: Array<[string, number]> = [
      ['https://gruene-lsa.de/presse/klima', 0],
      ['https://gruene-lsa.de/presse/klima', 3],
      ['https://example.org/a', 1],
    ];
    for (const [url, idx] of cases) {
      const id = generateLvPointId(url, idx);
      expect(id).toBe(referencePointId(url, idx));
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces different ids for different chunk indices', () => {
    const url = 'https://gruene-lsa.de/presse/klima';
    expect(generateLvPointId(url, 0)).not.toBe(generateLvPointId(url, 1));
  });
});
