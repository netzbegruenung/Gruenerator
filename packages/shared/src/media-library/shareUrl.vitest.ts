import { describe, expect, it } from 'vitest';

import { resolveStoredImageUrl, shareTokenFromShareUrl, sharedMediaPreviewUrl } from './shareUrl';

describe('shareTokenFromShareUrl', () => {
  it('liest den Token aus der Seiten-URL, die der Upload zurückgibt', () => {
    expect(shareTokenFromShareUrl('/share/abc123')).toBe('abc123');
    expect(shareTokenFromShareUrl('/share/abc123/')).toBe('abc123');
  });

  it.each([
    ['eine absolute URL', 'https://canva.com/og.png'],
    ['die Datei-URL selbst', '/api/share/abc123/preview'],
    ['einen fremden Pfad', '/images/logo.png'],
    ['leer', ''],
  ])('lässt %s in Ruhe', (_label, url) => {
    expect(shareTokenFromShareUrl(url)).toBeNull();
  });
});

describe('sharedMediaPreviewUrl', () => {
  it('baut die Vorschau unter dem /api-Präfix, nicht an der Herkunftswurzel', () => {
    expect(sharedMediaPreviewUrl('tok')).toBe('/api/share/tok/preview?w=400&fmt=webp');
  });

  it('nimmt eine absolute Basis samt /api, wie sie die App mitbringt', () => {
    expect(
      sharedMediaPreviewUrl('tok', { baseUrl: 'https://gruenerator.eu/api', width: 800 })
    ).toBe('https://gruenerator.eu/api/share/tok/preview?w=800&fmt=webp');
  });

  it('verdoppelt den Schrägstrich einer Basis mit Schlusszeichen nicht', () => {
    expect(sharedMediaPreviewUrl('tok', { baseUrl: 'https://gruenerator.eu/api/' })).toBe(
      'https://gruenerator.eu/api/share/tok/preview?w=400&fmt=webp'
    );
  });
});

describe('resolveStoredImageUrl', () => {
  it('übersetzt die gespeicherte Seiten-URL in die Bilddatei', () => {
    expect(resolveStoredImageUrl('/share/tok', { baseUrl: 'https://gruenerator.eu/api' })).toBe(
      'https://gruenerator.eu/api/share/tok/preview?w=400&fmt=webp'
    );
  });

  it('reicht das gecrawlte og:image unverändert durch', () => {
    const url = 'https://canva.com/og.png';
    expect(resolveStoredImageUrl(url)).toBe(url);
  });

  it('antwortet auf nichts mit null statt mit einer gebauten URL', () => {
    expect(resolveStoredImageUrl(undefined)).toBeNull();
    expect(resolveStoredImageUrl(null)).toBeNull();
    expect(resolveStoredImageUrl('')).toBeNull();
  });
});
