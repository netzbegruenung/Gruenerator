/**
 * The mint sites are where the fix actually lands: the already-shipped mobile
 * app renders `thumbnailUrl` verbatim, so what these mappers emit is what a
 * phone with the current binary will try to load.
 *
 * Both of the previously broken shapes are asserted negatively, because "not the
 * old URL" is the regression that matters — a passing render test would not
 * notice a mapper quietly falling back to an auth-gated route.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  MEDIA_URL_SIGNING_SECRET: 'test-key' as string | undefined,
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const { buildCanvasThumbnailUrl, buildThumbnailTileUrl, versionFromDate } =
  await import('./thumbnailUrl.js');
const { verifyThumbnail } = await import('./thumbnailSignature.js');

function parse(url: string): { path: string; params: URLSearchParams } {
  const [p, q] = url.split('?');
  return { path: p, params: new URLSearchParams(q) };
}

/** Verify a minted URL the way the route will. */
function accepted(url: string): boolean {
  const { path, params } = parse(url);
  const [, , , kind, id, v] = path.split('/');
  return verifyThumbnail({ kind: kind as 'media' | 'reel' | 'canvas', id, v }, params.get('sig'))
    .ok;
}

beforeEach(() => {
  envMock.MEDIA_URL_SIGNING_SECRET = 'test-key';
});

describe('recent-activity mint sites', () => {
  it('mints a media tile the route accepts', () => {
    const url = buildThumbnailTileUrl(
      'media',
      'a'.repeat(32),
      versionFromDate(new Date())
    ) as string;
    expect(accepted(url)).toBe(true);
  });

  it('no longer points reels at the auth-gated subtitler route', () => {
    const url = buildThumbnailTileUrl(
      'reel',
      '11111111-1111-4111-8111-111111111111',
      versionFromDate('2026-08-01T00:00:00Z')
    ) as string;
    // The old shape 401'd for a header-less <Image>, which is why every reel
    // tile was blank.
    expect(url).not.toContain('/api/subtitler/');
    expect(accepted(url)).toBe(true);
  });

  it('no longer passes the stored canvas download URL through', () => {
    const url = buildCanvasThumbnailUrl(
      '22222222-2222-4222-8222-222222222222',
      '/api/share/deadbeef/download'
    ) as string;
    // /download requires auth — passing it through is why canvases with a
    // thumbnail still rendered a blank plate.
    expect(url).not.toContain('/download');
    expect(accepted(url)).toBe(true);
  });
});

describe('invalidation contract', () => {
  it('changes the media URL when the row timestamp changes', () => {
    const id = 'b'.repeat(32);
    const before = buildThumbnailTileUrl('media', id, versionFromDate('2026-08-01T10:00:00Z'));
    const after = buildThumbnailTileUrl('media', id, versionFromDate('2026-08-01T10:00:05Z'));
    expect(before).not.toBe(after);
    // Not just the query string: the cache path is derived from the version
    // segment, so a changed URL that shares a path segment would still serve
    // the stale bytes.
    expect(parse(before as string).path).not.toBe(parse(after as string).path);
  });

  it('changes the canvas URL when the canvas is re-rendered', () => {
    // A re-render mints a new thumbnail share and deletes the superseded one,
    // so the token is an exact content identity rather than an approximation.
    const id = '33333333-3333-4333-8333-333333333333';
    const before = buildCanvasThumbnailUrl(id, '/api/share/aaaaaaaaaaaa/download') as string;
    const after = buildCanvasThumbnailUrl(id, '/api/share/bbbbbbbbbbbb/download') as string;
    expect(parse(before).path).not.toBe(parse(after).path);
  });

  it('keeps the URL stable when nothing changed, so caches are not busted', () => {
    const id = 'c'.repeat(32);
    const v = versionFromDate('2026-08-01T10:00:00Z');
    expect(buildThumbnailTileUrl('media', id, v)).toBe(buildThumbnailTileUrl('media', id, v));
  });
});

describe('degradation without a signing key', () => {
  it('omits the URL entirely rather than emitting one that 403s', () => {
    envMock.MEDIA_URL_SIGNING_SECRET = undefined;
    expect(buildThumbnailTileUrl('media', 'x', 'v')).toBeNull();
    expect(buildCanvasThumbnailUrl('x', '/api/share/tok/download')).toBeNull();
  });
});
