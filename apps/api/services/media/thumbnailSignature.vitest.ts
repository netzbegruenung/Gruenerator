import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  MEDIA_URL_SIGNING_SECRET: undefined as string | undefined,
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: undefined as string | undefined,
  SESSION_SECRET: undefined as string | undefined,
};

vi.mock('../../config/env.js', () => ({ env: envMock }));

const { isThumbnailSigningConfigured, signThumbnail, verifyThumbnail } =
  await import('./thumbnailSignature.js');

const D = { kind: 'media' as const, id: 'abc123', v: 'v1' };

describe('thumbnailSignature', () => {
  beforeEach(() => {
    envMock.MEDIA_URL_SIGNING_SECRET = 'current-key';
    envMock.MEDIA_URL_SIGNING_SECRET_PREVIOUS = undefined;
    envMock.SESSION_SECRET = undefined;
  });

  it('round-trips a descriptor', () => {
    const sig = signThumbnail(D);
    expect(sig).toBeTruthy();
    expect(verifyThumbnail(D, sig)).toEqual({ ok: true });
  });

  it.each([
    ['kind', { ...D, kind: 'reel' as const }],
    ['id', { ...D, id: 'abc124' }],
    ['v', { ...D, v: 'v2' }],
  ])('rejects a signature bound to a different %s', (_field, tampered) => {
    const sig = signThumbnail(D);
    expect(verifyThumbnail(tampered, sig)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('does not let field boundaries shift', () => {
    // ('ab','c') and ('a','bc') must not sign identically — that is what the
    // newline separator in the signed material is for.
    const a = signThumbnail({ kind: 'media', id: 'ab', v: 'c' });
    const b = signThumbnail({ kind: 'media', id: 'a', v: 'bc' });
    expect(a).not.toEqual(b);
  });

  it('falls back to SESSION_SECRET so existing deployments boot', () => {
    envMock.MEDIA_URL_SIGNING_SECRET = undefined;
    envMock.SESSION_SECRET = 'session-key';
    expect(isThumbnailSigningConfigured()).toBe(true);
    expect(verifyThumbnail(D, signThumbnail(D))).toEqual({ ok: true });
  });

  it('reports unconfigured and refuses to sign with no secret at all', () => {
    envMock.MEDIA_URL_SIGNING_SECRET = undefined;
    envMock.SESSION_SECRET = undefined;
    expect(isThumbnailSigningConfigured()).toBe(false);
    expect(signThumbnail(D)).toBeNull();
    expect(verifyThumbnail(D, 'anything')).toEqual({ ok: false, reason: 'unconfigured' });
  });

  it('treats a blank secret as unset rather than signing with whitespace', () => {
    envMock.MEDIA_URL_SIGNING_SECRET = '   ';
    expect(isThumbnailSigningConfigured()).toBe(false);
  });

  describe('rotation', () => {
    it('accepts a signature made with the previous key', () => {
      const old = signThumbnail(D);
      envMock.MEDIA_URL_SIGNING_SECRET = 'rotated-key';
      envMock.MEDIA_URL_SIGNING_SECRET_PREVIOUS = 'current-key';
      expect(verifyThumbnail(D, old)).toEqual({ ok: true });
    });

    it('never signs with the previous key', () => {
      envMock.MEDIA_URL_SIGNING_SECRET = 'rotated-key';
      envMock.MEDIA_URL_SIGNING_SECRET_PREVIOUS = 'current-key';
      const fresh = signThumbnail(D);

      envMock.MEDIA_URL_SIGNING_SECRET = 'rotated-key';
      envMock.MEDIA_URL_SIGNING_SECRET_PREVIOUS = undefined;
      expect(verifyThumbnail(D, fresh)).toEqual({ ok: true });
    });

    it('rejects the old key once it is dropped from _PREVIOUS', () => {
      const old = signThumbnail(D);
      envMock.MEDIA_URL_SIGNING_SECRET = 'rotated-key';
      expect(verifyThumbnail(D, old)).toEqual({ ok: false, reason: 'bad_signature' });
    });
  });

  describe('malformed input', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['a number', 42],
    ])('reports %s signatures as malformed, not forged', (_label, sig) => {
      expect(verifyThumbnail(D, sig)).toEqual({ ok: false, reason: 'malformed' });
    });

    it('does not throw on a truncated signature', () => {
      // timingSafeEqual throws on a length mismatch; the length must be checked
      // first or a short signature turns into a 500.
      const sig = signThumbnail(D) as string;
      expect(() => verifyThumbnail(D, sig.slice(0, 5))).not.toThrow();
      expect(verifyThumbnail(D, sig.slice(0, 5))).toEqual({ ok: false, reason: 'bad_signature' });
    });
  });
});
