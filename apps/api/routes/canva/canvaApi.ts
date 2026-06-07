/**
 * Canva Connect API integration routes (direct OAuth2 + PKCE, no Nango).
 *
 *   GET    /api/canva/status         → connection status for the current user
 *   GET    /api/canva/auth/start     → begin OAuth (redirects the popup to Canva)
 *   GET    /api/canva/auth/callback  → OAuth redirect target; exchanges the code
 *   DELETE /api/canva                → disconnect
 *
 * The OAuth popup is opened same-origin (`/api/canva/auth/start`), so the
 * session cookie rides along and `requireAuth` can identify the user. The
 * callback derives the user from the one-time PKCE state in Redis instead of
 * the cookie, so it works even if the cross-site redirect drops the cookie.
 */

import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getProfileDisplayName,
  listDesigns,
} from '../../services/api-clients/canvaClient.js';
import {
  CanvaConnectionManager,
  getCanvaCredentials,
  getCanvaRedirectUri,
} from '../../services/connections/canva/CanvaConnectionManager.js';
import {
  consumePkceState,
  createPkceState,
} from '../../services/connections/canva/canvaOAuthState.js';
import { createLogger } from '../../utils/logger.js';

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

router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const status = await CanvaConnectionManager.getStatus(userId);
    res.json(status);
  } catch (error) {
    log.error('Failed to get Canva status', { error: (error as Error).message });
    res.status(statusFromError(error)).json({ error: 'Status konnte nicht abgerufen werden' });
  }
});

router.get('/designs', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
});

router.get('/auth/start', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
});

// No requireAuth: the user is resolved from the one-time PKCE state in Redis.
router.get('/auth/callback', async (req: Request, res: Response): Promise<void> => {
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
