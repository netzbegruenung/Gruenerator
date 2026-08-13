/**
 * `GET /api/thumbs/:kind/:id/:v?w=&fmt=&sig=` — the unified preview endpoint.
 *
 * Deliberately unauthenticated. That is the whole point: a native `<Image>` and
 * a plain `<img>` send no Authorization header, so the permission has to live in
 * the URL. It does, as an HMAC minted by whichever list endpoint already checked
 * the caller's access — see `services/media/thumbnailSignature.ts` for what that
 * does and does not buy.
 *
 * Adding `requireAuth` here "to be safe" silently breaks every thumbnail in the
 * mobile app; `routes.mountGuard.vitest.ts` asserts against it.
 */

import express, { type Request, type Response, type Router } from 'express';

import { getThumbnailVariant, openVariant } from '../../services/media/thumbnailCache.js';
import { resolveThumbnailSource } from '../../services/media/thumbnailResolvers.js';
import { verifyThumbnail, type ThumbnailKind } from '../../services/media/thumbnailSignature.js';
import {
  isThumbnailFormat,
  isThumbnailWidth,
  type ThumbnailFormat,
  type ThumbnailWidth,
} from '../../services/media/thumbnailUrl.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('thumbnails');
const router: Router = express.Router();

const KINDS: readonly ThumbnailKind[] = ['media', 'reel', 'canvas'];

/**
 * Errors are never cached. A `processing` share cached as a permanent 404 is a
 * tile that stays broken forever, and a cached 403 survives a key rotation.
 */
function fail(res: Response, status: number, error: string): Response {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}

interface ThumbParams {
  kind: string;
  id: string;
  v: string;
}

router.get('/:kind/:id/:v', async (req: Request<ThumbParams>, res: Response) => {
  const { kind, id, v } = req.params;

  if (!KINDS.includes(kind as ThumbnailKind)) {
    return fail(res, 400, 'Unbekannter Vorschautyp');
  }

  // Width and format are validated against a closed allowlist rather than
  // clamped: they are not part of the signature, so an open range would let one
  // valid handle drive unbounded distinct renders — and a silent clamp turns a
  // client typo into a wrong-sized image nobody notices.
  //
  // No `w` at all means the original bytes, unresized — the canvas viewer
  // downloads this URL and saves it as the sharepic.
  const rawWidth = req.query.w;
  let width: ThumbnailWidth | null = null;
  if (rawWidth !== undefined) {
    const parsed = Number(rawWidth);
    if (!Number.isInteger(parsed) || !isThumbnailWidth(parsed)) {
      return fail(res, 400, 'Ungültige Breite');
    }
    width = parsed;
  }

  const rawFmt = req.query.fmt;
  let fmt: ThumbnailFormat = 'webp';
  if (rawFmt !== undefined) {
    if (typeof rawFmt !== 'string' || !isThumbnailFormat(rawFmt)) {
      return fail(res, 400, 'Ungültiges Format');
    }
    fmt = rawFmt;
  }

  const verified = verifyThumbnail({ kind: kind as ThumbnailKind, id, v }, req.query.sig);
  if (!verified.ok) {
    if (verified.reason === 'unconfigured') return fail(res, 503, 'Vorschau nicht konfiguriert');
    if (verified.reason === 'malformed') return fail(res, 400, 'Signatur fehlt');
    return fail(res, 403, 'Ungültige Signatur');
  }

  // `v` identifies the content, so it is the ETag — no hashing needed. Answered
  // before any filesystem work, because that is the request this saves.
  const etag = `"${v}-w${width ?? 'orig'}-${fmt}"`;
  if (req.headers['if-none-match'] === etag) {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(304).end();
  }

  try {
    const source = await resolveThumbnailSource(kind as ThumbnailKind, id);
    if (!source.ok) return fail(res, 404, 'Vorschau nicht verfügbar');

    const variant = await getThumbnailVariant(
      { kind: kind as ThumbnailKind, id, v, width, fmt },
      source
    );
    if (!variant) return fail(res, 404, 'Vorschau nicht verfügbar');

    res.setHeader('Content-Type', variant.contentType);
    res.setHeader('Content-Length', variant.size);
    // `immutable` is earned here, unlike on /preview: the version segment
    // changes whenever the content can, so a cached copy can never go stale.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);

    if (variant.buffer) return res.send(variant.buffer);
    // Streamed rather than res.sendFile: sendFile writes its own Cache-Control
    // and ETag over the ones set above.
    return openVariant(variant.filePath as string).pipe(res);
  } catch (error) {
    log.error('Failed to serve thumbnail:', error);
    return fail(res, 500, 'Fehler beim Laden der Vorschau');
  }
});

export default router;
