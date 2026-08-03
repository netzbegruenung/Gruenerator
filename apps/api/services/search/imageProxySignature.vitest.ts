/**
 * The signature is what narrows the proxy from "any URL an authenticated user
 * names" to "a URL this backend returned from a search". Every test here is about
 * a way that narrowing could quietly stop holding — a forged handle accepted, an
 * expiry that can be edited, a missing secret that still produces signatures.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  SEARCH_IMAGE_PROXY_SECRET: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
};

vi.mock('../../config/env.js', () => ({ env: envMock }));

const { buildImageProxyPath, isImageProxyConfigured, signImageUrl, verifyImageUrl } =
  await import('./imageProxySignature.js');

const URL_A = 'https://zeit.de/bild-1.jpg';
const URL_B = 'https://spiegel.de/foto.png';

describe('imageProxySignature', () => {
  beforeEach(() => {
    envMock.SEARCH_IMAGE_PROXY_SECRET = 'test-secret';
    envMock.SESSION_SECRET = undefined;
  });

  it('accepts a handle it just issued', () => {
    const handle = signImageUrl(URL_A);
    expect(handle).not.toBeNull();
    const result = verifyImageUrl({
      url: handle!.url,
      exp: String(handle!.exp),
      sig: handle!.sig,
    });
    expect(result).toEqual({ ok: true, url: URL_A });
  });

  it('rejects a handle whose URL was swapped', () => {
    // The whole point: a signature for one image must not authorise another.
    const handle = signImageUrl(URL_A)!;
    const result = verifyImageUrl({ url: URL_B, exp: String(handle.exp), sig: handle.sig });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a handle whose expiry was extended', () => {
    // The expiry is inside the signed material, so pushing it out invalidates
    // the signature instead of buying more time.
    const handle = signImageUrl(URL_A)!;
    const result = verifyImageUrl({
      url: handle.url,
      exp: String(handle.exp + 60_000),
      sig: handle.sig,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an expired handle', () => {
    const handle = signImageUrl(URL_A, 0)!;
    const result = verifyImageUrl(
      { url: handle.url, exp: String(handle.exp), sig: handle.sig },
      handle.exp + 1
    );
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // `timingSafeEqual` throws on a length mismatch — the length has to be
    // compared before it is reached, or a short signature crashes the route.
    const handle = signImageUrl(URL_A)!;
    expect(() =>
      verifyImageUrl({ url: handle.url, exp: String(handle.exp), sig: 'kurz' })
    ).not.toThrow();
    expect(verifyImageUrl({ url: handle.url, exp: String(handle.exp), sig: 'kurz' })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects missing or non-string parameters', () => {
    expect(verifyImageUrl({})).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyImageUrl({ url: URL_A, exp: '123', sig: undefined })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyImageUrl({ url: URL_A, exp: 'morgen', sig: 'x' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('separates url from expiry so the boundary cannot be shifted', () => {
    // Signing `url + exp` unseparated would let one field borrow characters from
    // the other, and two different (url, exp) pairs could share a signature.
    const a = signImageUrl('https://x.de/a', 1_000)!;
    const b = signImageUrl('https://x.de/a\n1000', 0)!;
    expect(a.sig).not.toBe(b.sig);
  });

  describe('without a configured secret', () => {
    beforeEach(() => {
      envMock.SEARCH_IMAGE_PROXY_SECRET = undefined;
      envMock.SESSION_SECRET = undefined;
    });

    it('issues no handle at all rather than signing with a constant', () => {
      // Signing with a fallback constant would be worse than not signing: the
      // capability check would LOOK enforced while being forgeable by anyone who
      // read the source.
      expect(signImageUrl(URL_A)).toBeNull();
      expect(buildImageProxyPath(URL_A)).toBeNull();
      expect(isImageProxyConfigured()).toBe(false);
    });

    it('verifies nothing, so the route degrades closed', () => {
      expect(verifyImageUrl({ url: URL_A, exp: '9999999999999', sig: 'x' })).toEqual({
        ok: false,
        reason: 'unconfigured',
      });
    });
  });

  it('falls back to SESSION_SECRET so existing deployments keep working', () => {
    envMock.SEARCH_IMAGE_PROXY_SECRET = undefined;
    envMock.SESSION_SECRET = 'session-secret';
    expect(isImageProxyConfigured()).toBe(true);
    const handle = signImageUrl(URL_A)!;
    expect(verifyImageUrl({ url: handle.url, exp: String(handle.exp), sig: handle.sig })).toEqual({
      ok: true,
      url: URL_A,
    });
  });

  it('treats a blank secret as no secret', () => {
    envMock.SEARCH_IMAGE_PROXY_SECRET = '   ';
    envMock.SESSION_SECRET = undefined;
    expect(isImageProxyConfigured()).toBe(false);
  });

  it('builds a path the client can put in src', () => {
    const path = buildImageProxyPath(URL_A);
    expect(path).toMatch(/^\/api\/search-image\?/);
    const query = new URLSearchParams(path!.split('?')[1]);
    // Round-trips through the query string — an unencoded URL would lose
    // everything after its first `&`.
    expect(query.get('url')).toBe(URL_A);
    expect(
      verifyImageUrl({
        url: query.get('url'),
        exp: query.get('exp'),
        sig: query.get('sig'),
      })
    ).toEqual({ ok: true, url: URL_A });
  });

  it('round-trips a url containing query parameters', () => {
    const tricky = 'https://cdn.example.org/i?id=7&size=large&sig=abc';
    const path = buildImageProxyPath(tricky)!;
    const query = new URLSearchParams(path.split('?')[1]);
    expect(query.get('url')).toBe(tricky);
    expect(
      verifyImageUrl({ url: query.get('url'), exp: query.get('exp'), sig: query.get('sig') })
    ).toEqual({ ok: true, url: tricky });
  });
});
