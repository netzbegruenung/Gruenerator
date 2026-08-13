/**
 * Signed handles for the unified thumbnail endpoint.
 *
 * A thumbnail has to render from a bare `<img src>` / `expo-image` source: those
 * send no Authorization header, and there is no hook to add one. So the URL
 * itself has to carry the permission. Until now that was solved twice, badly —
 * media hang their permission on the `share_token` (a value that is
 * simultaneously a database column, a directory name and an access right, which
 * means it can never be rotated), and reels were simply put behind `requireAuth`,
 * where a native `<Image>` gets a 401 and shows nothing.
 *
 * This signs `(kind, id, version)` with a key WE hold. Same capability strength
 * as the share token, but revocable without touching the data, and usable for
 * kinds that have no share row at all.
 *
 * ## What the signature does and does not do
 *
 * Authorization happens exclusively at mint time. Every mint site already ran
 * the ACL query needed to produce the row (`getUserShares`, `getProject(userId,
 * …)`, `CANVAS_ACCESS_WHERE`), so a URL only exists for content the caller was
 * already allowed to see. Serve time is anonymous by design and checks nothing
 * but the HMAC.
 *
 * The consequence, stated plainly rather than discovered later: a thumbnail URL
 * that leaks is a permanent anonymous read of that preview until the key is
 * rotated or the row is deleted. That is the price of rendering without headers,
 * and it is the same trade the share token already makes.
 *
 * Deliberately NOT in the signed material:
 *
 * - `w` / `fmt` — signing them would mean one handle per variant, so a 3-width
 *   srcset needs three signatures per row. They are validated against a closed
 *   allowlist at the route instead, which bounds the damage from a valid handle
 *   to "a few sharp renders, each cached once".
 * - `userId` — it would make the URL user-specific (two group members viewing
 *   the same canvas get two URLs and two cache entries for identical bytes), it
 *   cannot be checked against anything at serve time, and it leaks a user id
 *   into URLs that end up in screenshots.
 * - an expiry — a rotating signature plus `immutable` means a full re-download
 *   on every list refetch, which defeats the caching the endpoint exists for.
 *   Revocation is key rotation. Because clients never build these URLs
 *   themselves (the API hands them over ready-made), the scheme can gain an
 *   expiry later at the cost of one cache warm-up and no client migration.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../../config/env.js';

/**
 * Signature scheme version. Changing the layout of the signed material without
 * changing this would silently reinterpret old handles instead of rejecting
 * them.
 */
const SCHEME = 't1';

export type ThumbnailKind = 'media' | 'reel' | 'canvas';

export interface ThumbnailDescriptor {
  kind: ThumbnailKind;
  /** The owning domain's own id: share token, project id, canvas id. */
  id: string;
  /** Opaque content version — see thumbnailUrl.ts. */
  v: string;
}

/**
 * The current signing key, and the previous one during a rotation.
 *
 * `SESSION_SECRET` is only a boot fallback so existing deployments keep working;
 * it must never be the key you actually rotate, because rotating it logs out
 * every user on the platform. Set `MEDIA_URL_SIGNING_SECRET` and rotate that,
 * moving the old value to `MEDIA_URL_SIGNING_SECRET_PREVIOUS` for one deploy so
 * URLs already sitting in cached list responses keep resolving.
 */
function getSecrets(): { current: string; previous: string | null } | null {
  const current = env.MEDIA_URL_SIGNING_SECRET ?? env.SESSION_SECRET;
  if (!current || current.trim().length === 0) return null;
  const previous = env.MEDIA_URL_SIGNING_SECRET_PREVIOUS?.trim();
  return { current, previous: previous && previous.length > 0 ? previous : null };
}

export function isThumbnailSigningConfigured(): boolean {
  return getSecrets() !== null;
}

function computeSignature(secret: string, d: ThumbnailDescriptor): string {
  // Newline-separated with a scheme prefix: concatenating fields without a
  // separator lets one borrow characters from the next, so ('ab', 'c') and
  // ('a', 'bc') would sign identically.
  return createHmac('sha256', secret)
    .update(`${SCHEME}\n${d.kind}\n${d.id}\n${d.v}`)
    .digest('base64url');
}

/** Sign a descriptor, or null when no key is configured. */
export function signThumbnail(d: ThumbnailDescriptor): string | null {
  const secrets = getSecrets();
  if (!secrets) return null;
  return computeSignature(secrets.current, d);
}

export type ThumbnailVerifyFailure = 'unconfigured' | 'malformed' | 'bad_signature';

export function verifyThumbnail(
  d: ThumbnailDescriptor,
  sig: unknown
): { ok: true } | { ok: false; reason: ThumbnailVerifyFailure } {
  const secrets = getSecrets();
  if (!secrets) return { ok: false, reason: 'unconfigured' };
  if (typeof sig !== 'string' || sig.length === 0) return { ok: false, reason: 'malformed' };

  const candidate = Buffer.from(sig);
  for (const secret of [secrets.current, secrets.previous]) {
    if (!secret) continue;
    const expected = Buffer.from(computeSignature(secret, d));
    // timingSafeEqual throws on a length mismatch, and the throw would itself
    // leak the expected length — so lengths are compared first, in the open.
    if (expected.length !== candidate.length) continue;
    if (timingSafeEqual(expected, candidate)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}
