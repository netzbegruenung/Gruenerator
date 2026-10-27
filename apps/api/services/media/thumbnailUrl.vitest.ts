import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  MEDIA_URL_SIGNING_SECRET: undefined as string | undefined,
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
};

vi.mock('../../config/env.js', () => ({ env: envMock }));

const {
  buildCanvasThumbnailUrl,
  buildStoredImageTileUrl,
  buildThumbnailBase,
  buildThumbnailTileUrl,
  buildThumbnailUrl,
  parseTemplatePageThumbnailId,
  templatePageThumbnailId,
  versionFromDate,
  versionFromShareToken,
  versionFromUrl,
} = await import('./thumbnailUrl.js');
const { verifyThumbnail } = await import('./thumbnailSignature.js');
const { shareTokenFromDownloadUrl } = await import('@gruenerator/shared/media-library/shareUrl');

function parse(url: string): { path: string; params: URLSearchParams } {
  const [path, query] = url.split('?');
  return { path, params: new URLSearchParams(query) };
}

describe('thumbnailUrl', () => {
  beforeEach(() => {
    envMock.MEDIA_URL_SIGNING_SECRET = 'test-key';
    envMock.MEDIA_URL_SIGNING_SECRET_PREVIOUS = undefined;
    envMock.SESSION_SECRET = undefined;
  });

  it('mints a URL the route will accept', () => {
    const url = buildThumbnailTileUrl('media', 'abc', 'v1') as string;
    const { path, params } = parse(url);
    expect(path).toBe('/api/thumbs/media/abc/v1');
    expect(params.get('w')).toBe('400');
    expect(params.get('fmt')).toBe('webp');
    expect(verifyThumbnail({ kind: 'media', id: 'abc', v: 'v1' }, params.get('sig'))).toEqual({
      ok: true,
    });
  });

  it('is origin-relative — an absolute URL would bake a host into cached data', () => {
    expect(buildThumbnailTileUrl('reel', 'abc', 'v1')).toMatch(/^\/api\/thumbs\//);
  });

  it('omits w and fmt for the srcset base, so one signature serves every variant', () => {
    const { params } = parse(buildThumbnailBase({ kind: 'media', id: 'abc', v: 'v1' }) as string);
    expect(params.get('w')).toBeNull();
    expect(params.get('fmt')).toBeNull();
    expect(params.get('sig')).toBeTruthy();
  });

  it('signs the same handle regardless of the width asked for', () => {
    const a = parse(buildThumbnailUrl({ kind: 'media', id: 'abc', v: 'v1' }, { w: 200 }) as string);
    const b = parse(buildThumbnailUrl({ kind: 'media', id: 'abc', v: 'v1' }, { w: 800 }) as string);
    expect(a.params.get('sig')).toBe(b.params.get('sig'));
  });

  it('returns null rather than an unsigned URL when no key is configured', () => {
    envMock.MEDIA_URL_SIGNING_SECRET = undefined;
    expect(buildThumbnailTileUrl('media', 'abc', 'v1')).toBeNull();
    expect(buildCanvasThumbnailUrl('id', '/api/share/tok/download')).toBeNull();
  });

  describe('version tokens', () => {
    it('changes when the timestamp does — the whole point of the segment', () => {
      const a = versionFromDate('2026-08-01T10:00:00.000Z');
      const b = versionFromDate('2026-08-01T10:00:05.000Z');
      expect(a).not.toBe(b);
    });

    it('is stable across equivalent Date and ISO-string inputs', () => {
      const iso = '2026-08-01T10:00:00.000Z';
      expect(versionFromDate(new Date(iso))).toBe(versionFromDate(iso));
    });

    it.each([null, undefined, 'not a date'])('degrades to a constant for %s', (input) => {
      expect(versionFromDate(input)).toBe('0');
    });

    it('takes a stable prefix of a share token', () => {
      expect(versionFromShareToken('0123456789abcdef')).toBe('01234567');
    });
  });

  describe('canvas URLs', () => {
    it('extracts the share token web stores in the column', () => {
      expect(shareTokenFromDownloadUrl('/api/share/abc123/download')).toBe('abc123');
    });

    it.each([
      ['a preview URL', '/api/share/abc123/preview?w=400'],
      ['an absolute URL', 'https://evil.example/api/share/abc123/download'],
      ['an already-migrated thumbs URL', '/api/thumbs/canvas/x/v1?sig=y'],
      ['junk', 'nonsense'],
    ])('refuses %s', (_label, url) => {
      expect(shareTokenFromDownloadUrl(url)).toBeNull();
      expect(buildCanvasThumbnailUrl('canvas-id', url)).toBeNull();
    });

    it('versions on the thumbnail share token, so a re-render changes the URL', () => {
      const before = buildCanvasThumbnailUrl('canvas-id', '/api/share/aaaaaaaaaaaa/download');
      const after = buildCanvasThumbnailUrl('canvas-id', '/api/share/bbbbbbbbbbbb/download');
      expect(before).not.toBe(after);
    });

    it('has no thumbnail at all when the canvas was never rendered', () => {
      expect(buildCanvasThumbnailUrl('canvas-id', null)).toBeNull();
    });

    it('defaults to a tile but can be asked for the original bytes', () => {
      const tile = parse(buildCanvasThumbnailUrl('canvas-id', '/api/share/tok/download') as string);
      expect(tile.params.get('w')).toBe('400');
      const full = parse(
        buildCanvasThumbnailUrl('canvas-id', '/api/share/tok/download', {}) as string
      );
      expect(full.params.get('w')).toBeNull();
    });
  });

  describe('stored image URLs', () => {
    it.each([
      ['an upload page URL', '/share/tok'],
      ['an upload download URL', '/api/share/tok/download'],
      ['a remote image', 'https://example.org/og.png'],
    ])('mints a signed 400px tile for %s', (_label, stored) => {
      const url = buildStoredImageTileUrl('template', 'tpl-id', stored) as string;
      const { path, params } = parse(url);
      expect(path).toBe(`/api/thumbs/template/tpl-id/${versionFromUrl(stored)}`);
      expect(params.get('w')).toBe('400');
      expect(
        verifyThumbnail(
          { kind: 'template', id: 'tpl-id', v: versionFromUrl(stored) },
          params.get('sig') ?? undefined
        ).ok
      ).toBe(true);
    });

    it.each([
      ['nothing', null],
      ['a data URL', 'data:image/png;base64,AAAA'],
      ['a stray path', '/images/logo.png'],
      // Cloudflare challenges our server; the browser loads it fine.
      ['a Canva preview', 'https://www.canva.com/design/DAGxpyxRHwI/tq9NidZ_LANOvdCfUGcI8g/screen'],
    ])('mints nothing for %s, so the list keeps its raw URL', (_label, stored) => {
      expect(buildStoredImageTileUrl('template', 'tpl-id', stored)).toBeNull();
    });

    it('changes the version when the stored URL does', () => {
      expect(versionFromUrl('/share/a')).not.toBe(versionFromUrl('/share/b'));
      expect(versionFromUrl('/share/a')).toMatch(/^[A-Za-z0-9_-]{10}$/);
    });
  });

  describe('template page ids', () => {
    const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333';

    it('round-trips through the id the route receives', () => {
      const id = templatePageThumbnailId(TEMPLATE_ID, 7);
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(parseTemplatePageThumbnailId(id)).toEqual({ templateId: TEMPLATE_ID, index: 7 });
    });

    it('refuses anything else', () => {
      expect(parseTemplatePageThumbnailId(TEMPLATE_ID)).toBeNull();
      expect(parseTemplatePageThumbnailId(`${TEMPLATE_ID}-`)).toBeNull();
      expect(parseTemplatePageThumbnailId('x-1')).toBeNull();
    });
  });
});
