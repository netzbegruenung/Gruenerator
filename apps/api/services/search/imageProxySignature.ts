/**
 * Signed handles for the search-image proxy.
 *
 * The proxy fetches a URL the user never typed, from our servers, with our IP.
 * Authentication alone does not make that safe: it would still let any logged-in
 * account use the instance as a general-purpose fetcher — hiding their origin
 * behind ours, probing hosts that only we can reach, and burning our bandwidth on
 * arbitrary files. The signature narrows it from "any URL an authenticated user
 * names" to "a URL this backend already returned from a web search", which is the
 * only thing the feature actually needs.
 *
 * The expiry exists so a handle that leaks (chat export, screenshot, shared log)
 * stops working. Search results go stale long before a day is out, so the window
 * costs nothing.
 *
 * This is a capability check, not a substitute for SSRF validation: a signed URL
 * still gets fully validated at fetch time, because the host it resolves to can
 * change between signing and fetching.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../../config/env.js';

/** Handles outlive the answer they belong to by a day, not longer. */
const TTL_MS = 24 * 60 * 60 * 1000;

export interface SignedImageHandle {
  url: string;
  /** Expiry as epoch milliseconds. */
  exp: number;
  sig: string;
}

/**
 * The signing key.
 *
 * Falls back to `SESSION_SECRET` rather than inventing a required env var: this
 * signs a short-lived read capability for public web URLs, not a credential, and
 * a new mandatory secret would break every existing deployment on boot. Returns
 * null when neither is set — the caller then omits proxy handles entirely and the
 * UI keeps the plain links, which is the correct degradation. Silently signing
 * with a constant would be worse than not signing at all.
 */
function getSecret(): string | null {
  const secret = env.SEARCH_IMAGE_PROXY_SECRET ?? env.SESSION_SECRET;
  if (!secret || secret.trim().length === 0) return null;
  return secret;
}

export function isImageProxyConfigured(): boolean {
  return getSecret() !== null;
}

function computeSignature(secret: string, url: string, exp: number): string {
  // The expiry is inside the signed material, so it cannot be edited without
  // invalidating the handle. Newline-separated rather than concatenated: joining
  // two attacker-influenced strings without a separator lets one borrow
  // characters from the other.
  return createHmac('sha256', secret).update(`${url}\n${exp}`).digest('base64url');
}

/** Sign a URL for the proxy, or null when no secret is configured. */
export function signImageUrl(url: string, now = Date.now()): SignedImageHandle | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = now + TTL_MS;
  return { url, exp, sig: computeSignature(secret, url, exp) };
}

/** The relative path the client puts in `src`, or null when unsigned. */
export function buildImageProxyPath(url: string, now = Date.now()): string | null {
  const handle = signImageUrl(url, now);
  if (!handle) return null;
  const params = new URLSearchParams({
    url: handle.url,
    exp: String(handle.exp),
    sig: handle.sig,
  });
  return `/api/search-image?${params.toString()}`;
}

export type VerifyFailure = 'unconfigured' | 'malformed' | 'expired' | 'bad_signature';

export function verifyImageUrl(
  params: { url?: unknown; exp?: unknown; sig?: unknown },
  now = Date.now()
): { ok: true; url: string } | { ok: false; reason: VerifyFailure } {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'unconfigured' };

  const { url, exp, sig } = params;
  if (typeof url !== 'string' || typeof exp !== 'string' || typeof sig !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  const expMs = Number(exp);
  if (!Number.isFinite(expMs)) return { ok: false, reason: 'malformed' };
  // Checked BEFORE the signature comparison so an expired handle cannot be
  // distinguished from a forged one by timing alone.
  if (expMs <= now) return { ok: false, reason: 'expired' };

  const expected = computeSignature(secret, url, expMs);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length — so the lengths are compared first, in the open.
  if (a.length !== b.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };

  return { ok: true, url };
}
