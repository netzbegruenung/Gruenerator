/**
 * Canva Connect API integration routes (direct OAuth2 + PKCE, no Nango).
 *
 *   GET    /api/canva/status         → connection status for the current user
 *   GET    /api/canva/auth/start     → begin OAuth (redirects the popup to Canva)
 *   GET    /api/canva/auth/callback  → OAuth redirect target; exchanges the code
 *   GET    /api/canva/autofill/sources  → plan capabilities + brand templates with fields
 *   GET    /api/canva/autofill/fields   → data fields of a design or brand template
 *   POST   /api/canva/autofill/suggest  → the text fields, filled by AI from a Studio request
 *   POST   /api/canva/autofill          → a NEW design, its text fields filled
 *   POST   /api/canva/collections/:collectionId/export
 *                                    → a Marktplatz collection's stickers into a Canva folder
 *   DELETE /api/canva                → disconnect
 *
 * Instance admins only (except the callback and DELETE): the app has not passed
 * Canva's review, and until it does only our own Canva team may authorize it.
 * The gate sits here, not just in the UI. DELETE stays open so anyone can drop a
 * connection made before the gate existed.
 *
 * The OAuth popup is opened same-origin (`/api/canva/auth/start`), so the
 * session cookie rides along and `requireAuth` can identify the user. The
 * callback takes the user from the one-time PKCE state in Redis and saves the
 * connection only when the browser's own session is that user — the session
 * cookie is SameSite=Lax, so it comes along on Canva's top-level redirect back.
 */

import {
  canvaAutofillRequestSchema,
  canvaAutofillSourceSchema,
  canvaAutofillSuggestRequestSchema,
  marketplaceCollectionIdSchema,
} from '@gruenerator/contracts';
import { isAxiosError } from 'axios';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { optionalAuth, requireAuth } from '../../middleware/authMiddleware.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getProfileDisplayName,
  listDesigns,
} from '../../services/api-clients/canvaClient.js';
import {
  autofillDesign,
  getAutofillFields,
  getAutofillSources,
  suggestAutofillTexts,
} from '../../services/connections/canva/canvaAutofill.js';
import {
  CanvaConnectionManager,
  getCanvaCredentials,
  getCanvaRedirectUri,
} from '../../services/connections/canva/CanvaConnectionManager.js';
import {
  consumePkceState,
  createPkceState,
} from '../../services/connections/canva/canvaOAuthState.js';
import { exportCollectionToCanva } from '../../services/connections/canva/canvaStickerExport.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { buildMarketplaceContext } from '../../services/marketplace/context.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { createLogger } from '../../utils/logger.js';

import type { RequestWithLocale } from '../../services/localization/types.js';

const log = createLogger('canva');
const router: Router = Router();

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw Object.assign(new Error('Nicht authentifiziert'), { statusCode: 401 });
  return userId;
}

function statusFromError(error: unknown): number {
  const status = (error as { statusCode?: number }).statusCode;
  return typeof status === 'number' ? status : 500;
}

/**
 * A failed Canva call in words the user can act on. Canva answers a missing
 * plan feature with 403 ("requires one of capabilities …") and an id the user
 * cannot reach with 404. Only the status is read — never the response body,
 * which is not echoed to the client.
 */
function canvaFailure(error: unknown, fallback: string): { status: number; message: string } {
  const own = (error as { statusCode?: number }).statusCode;
  if (own === 404) return { status: 404, message: 'Keine Canva-Verbindung vorhanden' };
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return { status: 409, message: 'Bitte verbinde Canva neu.' };
    if (status === 403) {
      return {
        status: 403,
        message: 'Dafür braucht dein Canva-Konto Canva Pro, Teams oder Enterprise.',
      };
    }
    if (status === 404)
      return { status: 404, message: 'Diese Vorlage gibt es in Canva nicht mehr.' };
  }
  return { status: typeof own === 'number' ? own : 500, message: fallback };
}

async function requireCanvaAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user?.id || !(await requireInstanceAdmin(user.id, user.email ?? null))) {
    res.status(403).json({ error: 'Canva ist derzeit nur für Instanz-Admins freigeschaltet' });
    return;
  }
  next();
}

/**
 * Minimal HTML returned to the OAuth popup. It notifies the opener window and
 * closes itself; the opener refetches status when it observes the popup close.
 */
function popupResultHtml(ok: boolean, message: string): string {
  const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Canva</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center;color:#333">
<p>${ok ? '✅ Canva verbunden. Dieses Fenster kann geschlossen werden.' : `⚠️ ${safeMessage}`}</p>
<script>
  try { window.opener && window.opener.postMessage({ type: 'canva-oauth', ok: ${ok} }, '*'); } catch (e) {}
  setTimeout(function () { window.close(); }, ${ok ? 800 : 4000});
</script>
</body></html>`;
}

router.get(
  '/status',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const status = await CanvaConnectionManager.getStatus(userId);
      res.json(status);
    } catch (error) {
      log.error('Failed to get Canva status', { error: (error as Error).message });
      res.status(statusFromError(error)).json({ error: 'Status konnte nicht abgerufen werden' });
    }
  }
);

router.get(
  '/designs',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const accessToken = await CanvaConnectionManager.getValidAccessToken(userId);

      const query = typeof req.query.query === 'string' ? req.query.query : undefined;
      const continuation =
        typeof req.query.continuation === 'string' ? req.query.continuation : undefined;
      const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

      const result = await listDesigns(accessToken, {
        ...(query ? { query } : {}),
        ...(continuation ? { continuation } : {}),
        limit,
      });

      // Normalize to a flat shape the chat @canva picker consumes directly.
      const designs = result.items.map((d) => ({
        id: d.id,
        title: d.title ?? 'Unbenanntes Design',
        viewUrl: d.urls.view_url,
        editUrl: d.urls.edit_url,
        thumbnailUrl: d.thumbnail?.url ?? null,
        updatedAt: d.updated_at ?? null,
      }));

      res.json({ designs, continuation: result.continuation ?? null });
    } catch (error) {
      const status = statusFromError(error);
      log.error('Failed to list Canva designs', { error: (error as Error).message });
      if (status === 404) {
        res.status(404).json({ error: 'Keine Canva-Verbindung vorhanden', designs: [] });
        return;
      }
      res.status(status).json({ error: 'Designs konnten nicht geladen werden' });
    }
  }
);

router.get(
  '/auth/start',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { clientId } = getCanvaCredentials();
      const redirectUri = getCanvaRedirectUri();

      const { state, codeChallenge } = await createPkceState(userId);
      const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge });

      res.redirect(authorizeUrl);
    } catch (error) {
      log.error('Failed to start Canva OAuth', { error: (error as Error).message });
      res
        .status(statusFromError(error))
        .send(popupResultHtml(false, 'Canva-Verbindung konnte nicht gestartet werden.'));
    }
  }
);

// optionalAuth, not requireAuth: a missing session has to end on the popup
// page below, not in a 401.
router.get('/auth/callback', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  // The authorization code rides in the query string — RFC 6749 §4.1.2 has no
  // other channel for it. What we can stop is it travelling on from here: no
  // Referer to anything this page touches, and no copy in any cache
  // (CodeQL js/sensitive-get-query).
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');

  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    log.warn('Canva OAuth returned an error', { error: String(oauthError) });
    res.status(400).send(popupResultHtml(false, 'Canva hat die Autorisierung abgelehnt.'));
    return;
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    res.status(400).send(popupResultHtml(false, 'Ungültige Antwort von Canva.'));
    return;
  }

  try {
    const pkce = await consumePkceState(state);
    if (!pkce) {
      res.status(400).send(popupResultHtml(false, 'Sitzung abgelaufen. Bitte erneut verbinden.'));
      return;
    }

    // The state says who started the flow; only that user's browser may finish
    // it. The state is already consumed, so a refused callback cannot be retried.
    if (req.user?.id !== pkce.userId) {
      log.warn('Canva OAuth callback without the initiating session — not saving', {
        hasSession: Boolean(req.user),
      });
      res
        .status(403)
        .send(
          popupResultHtml(
            false,
            'Die Verbindung wurde nicht in dieser Anmeldung gestartet. Bitte im Grünerator anmelden und erneut verbinden.'
          )
        );
      return;
    }

    const creds = getCanvaCredentials();
    const redirectUri = getCanvaRedirectUri();

    const tokens = await exchangeCodeForTokens(creds, {
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUri,
    });

    let displayName: string | null = null;
    try {
      displayName = await getProfileDisplayName(tokens.access_token);
    } catch (profileError) {
      // Profile is cosmetic — don't fail the whole connection over it.
      log.warn('Failed to fetch Canva profile', { error: (profileError as Error).message });
    }

    await CanvaConnectionManager.save(pkce.userId, tokens, displayName);
    log.info('Canva connection established', { userId: pkce.userId });

    res.status(200).send(popupResultHtml(true, ''));
  } catch (error) {
    log.error('Canva OAuth callback failed', { error: (error as Error).message });
    res
      .status(500)
      .send(popupResultHtml(false, 'Verbindung mit Canva fehlgeschlagen. Bitte erneut versuchen.'));
  }
});

router.get(
  '/autofill/sources',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await getAutofillSources(getUserId(req)));
    } catch (error) {
      const failure = canvaFailure(error, 'Canva-Vorlagen konnten nicht geladen werden');
      log.error('Failed to load Canva autofill sources', { error: (error as Error).message });
      res.status(failure.status).json({ error: failure.message });
    }
  }
);

router.get(
  '/autofill/fields',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const source = canvaAutofillSourceSchema.safeParse(req.query);
    if (!source.success) {
      res.status(400).json({ error: 'Ungültige Vorlage' });
      return;
    }
    try {
      res.json(await getAutofillFields(getUserId(req), source.data));
    } catch (error) {
      const failure = canvaFailure(error, 'Felder der Vorlage konnten nicht gelesen werden');
      log.error('Failed to read Canva autofill fields', { error: (error as Error).message });
      res.status(failure.status).json({ error: failure.message });
    }
  }
);

// AI consent and the generation limiter sit on this path in routes.ts.
router.post(
  '/autofill/suggest',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const body = canvaAutofillSuggestRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Ungültige Anfrage' });
      return;
    }
    try {
      res.json(
        await suggestAutofillTexts(
          getUserId(req),
          body.data,
          extractLocaleFromRequest(req as RequestWithLocale)
        )
      );
    } catch (error) {
      const failure = canvaFailure(error, 'Der Vorschlag konnte nicht erstellt werden');
      log.error('Canva autofill suggestion failed', { error: (error as Error).message });
      res.status(failure.status).json({ error: failure.message });
    }
  }
);

router.post(
  '/autofill',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const body = canvaAutofillRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Ungültige Anfrage' });
      return;
    }
    try {
      const outcome = await autofillDesign(getUserId(req), body.data);
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.message });
        return;
      }
      res.json(outcome.value);
    } catch (error) {
      const failure = canvaFailure(error, 'Das Canva-Design konnte nicht erstellt werden');
      log.error('Canva autofill failed', { error: (error as Error).message });
      res.status(failure.status).json({ error: failure.message });
    }
  }
);

router.post(
  '/collections/:collectionId/export',
  requireAuth,
  requireCanvaAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const collectionId = marketplaceCollectionIdSchema.safeParse(req.params.collectionId);
    if (!collectionId.success) {
      res.status(400).json({ error: 'Unbekannte Kollektion' });
      return;
    }
    try {
      const ctx = buildMarketplaceContext({
        userId: getUserId(req),
        locale: extractLocaleFromRequest(req as RequestWithLocale),
        platform: 'web',
      });
      const outcome = await exportCollectionToCanva(ctx, collectionId.data);
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.message });
        return;
      }
      res.json(outcome.value);
    } catch (error) {
      log.error('Failed to export collection to Canva', {
        collectionId: collectionId.data,
        error: (error as Error).message,
      });
      const status = statusFromError(error);
      res.status(status).json({
        error:
          status === 404
            ? 'Keine Canva-Verbindung vorhanden'
            : 'Sticker konnten nicht zu Canva hinzugefügt werden',
      });
    }
  }
);

router.delete('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    await CanvaConnectionManager.disconnect(userId);
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to disconnect Canva', { error: (error as Error).message });
    res.status(statusFromError(error)).json({ error: 'Verbindung konnte nicht getrennt werden' });
  }
});

export default router;
