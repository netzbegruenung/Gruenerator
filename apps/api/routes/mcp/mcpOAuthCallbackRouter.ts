/**
 * OAuth redirect target for user-managed MCP servers: GET /api/mcp/auth/callback
 *
 * Public (no cookie): identity comes from the one-time Redis state, so the
 * cross-site redirect works even when the session cookie is dropped. Exchanges
 * the code for tokens, then returns an auto-closing popup page that postMessages
 * the result to the opener (origin-locked) — the Canva-style pattern.
 */

import { Router, type Request, type Response, type Application } from 'express';

import { env } from '../../config/env.js';
import { McpOAuthService } from '../../services/mcp/McpOAuthService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('mcp-oauth-callback');

// Codes that must be escaped when inlining JSON into a <script>: `< > &` (so
// `</script>` can't break out) and U+2028/U+2029 (JS-string line terminators).
const UNSAFE_CODES = new Set([0x3c, 0x3e, 0x26, 0x2028, 0x2029]);

/** Escape a value for safe inlining inside a <script>. The OAuth `error` string
 * is attacker-controlled, so this is required. */
function jsonForScript(value: unknown): string {
  const json = JSON.stringify(value);
  let out = '';
  for (const ch of json) {
    const code = ch.codePointAt(0)!;
    out += UNSAFE_CODES.has(code) ? '\\u' + code.toString(16).padStart(4, '0') : ch;
  }
  return out;
}

function targetOrigin(): string {
  try {
    return new URL(env.BASE_URL ?? '').origin;
  } catch {
    return '*';
  }
}

function renderResultPage(result: { serverId?: string; success: boolean; error?: string }): string {
  const payload = jsonForScript({ type: 'gruenerator-mcp-oauth', ...result });
  const origin = jsonForScript(targetOrigin());
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP</title></head><body>
<script>
(function () {
  try {
    if (window.opener) { window.opener.postMessage(${payload}, ${origin}); }
  } catch (e) {}
  setTimeout(function () { window.close(); }, 300);
})();
</script>
<p>${result.success ? 'Verbunden. Du kannst dieses Fenster schließen.' : 'Verbindung fehlgeschlagen.'}</p>
</body></html>`;
}

async function handleCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (oauthError) {
    res.send(renderResultPage({ success: false, error: oauthError }));
    return;
  }
  if (!code || !state) {
    res.send(renderResultPage({ success: false, error: 'missing_code_or_state' }));
    return;
  }
  try {
    const { serverId } = await McpOAuthService.handleCallback(code, state);
    res.send(renderResultPage({ success: true, serverId }));
  } catch (error) {
    log.warn('MCP OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.send(
      renderResultPage({ success: false, error: error instanceof Error ? error.message : 'error' })
    );
  }
}

export function mountMcpOAuthCallbackRouter(app: Application): void {
  const router: Router = Router();
  router.get('/callback', (req, res) => {
    void handleCallback(req, res);
  });
  app.use('/api/mcp/auth', router);
}
