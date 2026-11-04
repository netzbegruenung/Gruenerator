import { describe, expect, it, vi } from 'vitest';

vi.mock('../../mistral/index.js', () => ({ mistralEmbeddingService: {} }));

const { isStorageFull } = await import('./parliamentStore.js');

describe('isStorageFull', () => {
  it('erkennt die Meldungen, mit denen Qdrant ohne Platz antwortet (#4133)', () => {
    expect(
      isStorageFull(
        new Error(
          'Service internal error: No space left on device: WAL buffer size exceeds available disk space'
        )
      )
    ).toBe(true);
    expect(isStorageFull('Not enough space available for optimization, needed: 404897792')).toBe(
      true
    );
  });

  it('lässt gewöhnliche Fehler durch, damit nur das eine Dokument scheitert', () => {
    expect(isStorageFull(new Error('GreenPT documents API returned 503'))).toBe(false);
    expect(isStorageFull(new Error('fetch failed'))).toBe(false);
  });
});
