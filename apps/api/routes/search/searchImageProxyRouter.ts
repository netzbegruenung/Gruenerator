/**
 * Search-image proxy: serves a web-search image hit through our backend so the
 * reader's browser never contacts the source host.
 *
 * WHY THIS EXISTS. Rendering `<img src="https://fremde-domain/…">` in the chat
 * makes every reader's browser announce their IP — and the page they are looking
 * at — to whoever runs that host. We removed exactly that pattern once already
 * (citation favicons fetched from `google.com/s2/favicons`), and shipping it back
 * for search results would be the same trade in a worse form: an arbitrary host
 * instead of one. So #2206 rendered links. This route is what turns them into
 * thumbnails without giving the trade back.
 *
 * WHY IT IS NOT `safeFetch`. That helper validates the URL string and then calls
 * `fetch(urlString)` with default redirect following. For a proxy both halves are
 * holes: the fetch re-resolves the name (so a host that passed validation can
 * answer from a private address a moment later), and a 302 to
 * `169.254.169.254` walks straight past the check that just ran. Here every hop
 * is validated, redirects are followed manually, and the cap is small.
 *
 * The threat model is an attacker who can influence what a web search returns —
 * which is not exotic, because SEO is a profession. The signature (see
 * `imageProxySignature.ts`) already limits this to URLs we returned; everything
 * below assumes that limit can fail and re-checks anyway.
 */

import express, { type Request, type Response, type Router } from 'express';

import { verifyImageUrl, type VerifyFailure } from '../../services/search/imageProxySignature.js';
import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('SearchImageProxy');

/** The fetch Response — Express's `Response` shadows the global in this file. */
type FetchResponse = globalThis.Response;

const router: Router = express.Router();

/** Images above this are not thumbnails; they are someone else's bandwidth bill. */
const MAX_BYTES = 8 * 1024 * 1024;
/** A thumbnail that takes longer than this is not worth the socket. */
const FETCH_TIMEOUT_MS = 8000;
/**
 * Redirect hops we follow. CDNs legitimately use one or two; anything longer is
 * either broken or someone walking us somewhere. Each hop is re-validated, so
 * the cap is about cost, not safety.
 */
const MAX_REDIRECTS = 2;

/**
 * Renderable raster/vector types, by exact match.
 *
 * `image/svg+xml` is deliberately ABSENT. SVG is a document format: it can carry
 * script and external references, and browsers execute it when it is served as a
 * document. Proxying it from our own origin would additionally hand that script
 * our origin — the one thing a same-origin proxy must never do. A prefix test on
 * `image/` would have let it through, which is why this is a list.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/tiff',
]);

/** Browsers cache the bytes; the handle expires long before this matters. */
const CACHE_CONTROL = 'private, max-age=86400, immutable';

const VERIFY_STATUS: Record<VerifyFailure, number> = {
  // Not the client's fault and not a permission problem: the server has no key.
  unconfigured: 503,
  malformed: 400,
  expired: 410,
  bad_signature: 403,
};

/**
 * Validate one URL as a fetch target. Returns the validated absolute URL, or a
 * reason for the log.
 */
async function checkHop(raw: string): Promise<{ ok: true; url: URL } | { ok: false; why: string }> {
  const result = await validateUrlForFetch(raw, {
    // Only these two. `validateUrlForFetch` defaults to the same pair, but a
    // proxy is exactly the place where a later default change must not silently
    // widen what we will fetch.
    allowedProtocols: ['http:', 'https:'],
    allowPrivateIPs: false,
  });
  if (!result.isValid || !result.url) {
    return { ok: false, why: result.error ?? 'validation failed' };
  }
  return { ok: true, url: result.url };
}

/**
 * Fetch the image, following redirects by hand and validating every hop.
 *
 * `redirect: 'manual'` is the load-bearing option: with the default the runtime
 * follows a `Location` we never saw, and the SSRF check above would only ever
 * have covered the first URL in the chain.
 */
async function fetchImage(
  startUrl: URL,
  signal: AbortSignal
): Promise<{ ok: true; response: FetchResponse } | { ok: false; status: number; why: string }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const upstream = await fetch(current.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'image/*',
        // No cookies, no Authorization, no Referer: fetch sends none of these by
        // default, and naming that here is the point — a future "just add a
        // header" edit should have to argue with this comment. A Referer in
        // particular would tell the host which of our pages triggered the load,
        // re-creating the leak the proxy exists to close.
      },
    });

    const isRedirect = upstream.status >= 300 && upstream.status < 400;
    if (!isRedirect) {
      return { ok: true, response: upstream };
    }

    const location = upstream.headers.get('location');
    if (!location) {
      return { ok: false, status: 502, why: `redirect ${upstream.status} without Location` };
    }
    if (hop === MAX_REDIRECTS) {
      return { ok: false, status: 502, why: 'too many redirects' };
    }

    // Resolved against the current URL so a relative Location behaves, and
    // re-validated in full — this is the hop the default follower would have
    // taken blind.
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return { ok: false, status: 502, why: 'unparseable redirect target' };
    }
    const checked = await checkHop(next.toString());
    if (!checked.ok) {
      return { ok: false, status: 400, why: `redirect target rejected: ${checked.why}` };
    }
    current = checked.url;
  }

  return { ok: false, status: 502, why: 'redirect loop' };
}

/**
 * GET /api/search-image?url=…&exp=…&sig=…
 *
 * Auth and rate limiting are applied at the mount (see routes.ts).
 */
router.get('/', async (req: Request, res: Response) => {
  const verified = verifyImageUrl(req.query as Record<string, unknown>);
  if (!verified.ok) {
    // The reason goes to the log, not the body: a caller probing signatures
    // learns nothing from "forbidden" either way.
    log.warn(`[ImageProxy] Rejected handle: ${verified.reason}`);
    res.status(VERIFY_STATUS[verified.reason]).json({ error: 'Bildquelle nicht verfügbar.' });
    return;
  }

  const checked = await checkHop(verified.url);
  if (!checked.ok) {
    log.warn(`[ImageProxy] Rejected target: ${checked.why}`);
    res.status(400).json({ error: 'Bildquelle nicht erlaubt.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const fetched = await fetchImage(checked.url, controller.signal);
    if (!fetched.ok) {
      log.warn(`[ImageProxy] ${fetched.why} for ${checked.url.host}`);
      res.status(fetched.status).json({ error: 'Bild konnte nicht geladen werden.' });
      return;
    }
    const upstream = fetched.response;

    if (!upstream.ok) {
      res.status(502).json({ error: 'Bild konnte nicht geladen werden.' });
      return;
    }

    // Parameters are dropped ("image/jpeg; charset=binary") and the bare type is
    // matched against the list — a substring test would accept
    // "text/html; x=image/png".
    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
      log.warn(`[ImageProxy] Refused content-type "${contentType}" from ${checked.url.host}`);
      res.status(415).json({ error: 'Kein unterstütztes Bildformat.' });
      return;
    }

    // Content-Length is a hint from the same host we are guarding against, so it
    // is only used to reject early. The real cap is counted from the bytes.
    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      res.status(413).json({ error: 'Bild ist zu groß.' });
      return;
    }

    const body = upstream.body;
    if (!body) {
      res.status(502).json({ error: 'Bild konnte nicht geladen werden.' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    // Served from our origin, so our own protections have to be stated: never
    // sniff the bytes into something executable, and never let the response be
    // framed or treated as a document.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    let written = 0;
    const reader = body.getReader();
    // Streamed rather than buffered: a host that lies about Content-Length is
    // stopped at the cap instead of being allowed to fill our memory first.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > MAX_BYTES) {
        log.warn(`[ImageProxy] Exceeded size cap from ${checked.url.host}`);
        await reader.cancel().catch(() => undefined);
        // Headers are already out, so the only honest signal left is to break the
        // response. A truncated image renders as broken, which is the truth.
        res.destroy();
        return;
      }
      if (!res.write(value)) {
        // Respect backpressure — without this a slow client turns into unbounded
        // buffering on our side.
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === 'AbortError';
    log.warn(`[ImageProxy] ${aborted ? 'Timeout' : 'Fetch failed'}: ${msg}`);
    if (!res.headersSent) {
      res.status(aborted ? 504 : 502).json({ error: 'Bild konnte nicht geladen werden.' });
    } else {
      res.destroy();
    }
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
