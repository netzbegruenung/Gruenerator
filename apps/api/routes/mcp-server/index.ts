/**
 * Der Grünerator-MCP (POST /api/mcp-server; öffentlich mcp.gruenerator.eu über
 * nginx, mit /v2 und /mcp als dauerhaften Aliassen). NOT routes/mcp/ — that is
 * the user-managed OUTBOUND client registry; here Grünerator is the MCP SERVER
 * for external clients, authenticated via OAuth (Better Auth `mcp` plugin) or
 * API key. Anonymen Zugang gibt es nicht: ohne Token 401 mit
 * `WWW-Authenticate`, aus dem ein OAuth-fähiger Client selbst weiterfindet.
 *
 * Stateless streamable HTTP JSON, fresh McpServer per POST — claude.ai/ChatGPT
 * don't carry an mcp-session-id, and per-user/per-scope registration needs it.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env.js';
import { MCP_RESOURCE_URL } from '../../config/mcpServer.js';
import { Sentry } from '../../lib/sentry.js';
import {
  API_KEY_DEFAULT_RATE_LIMIT,
  consumeApiKeyRateLimit,
} from '../../middleware/apiKeyRateLimitMiddleware.js';
import { hasAiConsent } from '../../middleware/requireAiConsent.js';
import { createLogger } from '../../utils/logger.js';

import { resolveMcpAuth } from './mcpAuth.js';
import { buildAuthenticatedMcpServer } from './serverFactory.js';

const log = createLogger('McpServer');

// Spec 2026-07-28 partitions the JSON-RPC server-error range: -32000..-32019
// stays implementation-defined, -32020..-32099 is reserved for the spec. Both
// codes below sit in the implementation-defined window. (Was -32029.)
// Rationale in CLAUDE-mcp.md; standard codes come from the SDK's ErrorCode.
const JSONRPC_UNAUTHORIZED = -32000;
const JSONRPC_METHOD_NOT_ALLOWED = -32000;
const JSONRPC_RATE_LIMITED = -32003;
const JSONRPC_CONSENT_REQUIRED = -32004;

const resourceUrl = new URL(MCP_RESOURCE_URL);
const PROTECTED_RESOURCE_METADATA_URL = `${resourceUrl.origin}/.well-known/oauth-protected-resource${
  resourceUrl.pathname === '/' ? '' : resourceUrl.pathname
}`;

const limiter =
  process.env.DISABLE_RATE_LIMITS === 'true'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: env.MCP_SERVER_RATE_LIMIT,
        standardHeaders: true,
        legacyHeaders: false,
        // IP-keyed on purpose: bucketing by the (attacker-controlled)
        // Authorization header would give every token guess a fresh window.
        keyGenerator: (req: Request) => (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
        message: {
          jsonrpc: '2.0',
          error: { code: JSONRPC_RATE_LIMITED, message: 'Zu viele Anfragen – bitte kurz warten.' },
          id: null,
        },
      });

function unauthorized(res: Response): void {
  res
    .status(401)
    .set('WWW-Authenticate', `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`)
    .set('Access-Control-Expose-Headers', 'WWW-Authenticate')
    .json({
      jsonrpc: '2.0',
      error: { code: JSONRPC_UNAUTHORIZED, message: 'Unauthorized: Authentication required' },
      id: null,
    });
}

// Body parsing happens in the global JSON middleware (server.ts) before this
// router runs — a router-level parser here would be a no-op.
const router: Router = Router();
router.use(limiter);

router.post('/', async (req, res) => {
  const authCtx = await resolveMcpAuth(req);
  if (!authCtx) {
    unauthorized(res);
    return;
  }

  // Das Kontingent des Schlüssels gilt an beiden Türen — die IP-Begrenzung oben
  // schützt vor Rateversuchen, nicht vor einem Partner, der sein vereinbartes
  // Kontingent überzieht, indem er statt der REST-Route den MCP-Weg nimmt.
  if (authCtx.apiKey) {
    const verdict = await consumeApiKeyRateLimit(
      authCtx.apiKey.id,
      'mcp',
      authCtx.apiKey.rateLimitPerMinute ?? API_KEY_DEFAULT_RATE_LIMIT
    );
    if (!verdict.ok) {
      res
        .status(429)
        .set('Retry-After', String(verdict.retryAfterSeconds))
        .json({
          jsonrpc: '2.0',
          error: {
            code: JSONRPC_RATE_LIMITED,
            message: `Kontingent erschöpft (${verdict.limit}/min) – bitte kurz warten.`,
          },
          id: null,
        });
      return;
    }
  }

  // Art.-9-Einwilligung. Der MCP-Pfad braucht die Prüfung eigens: er löst seine
  // Tokens selbst auf, sieht `requireAuth` nie und belegt `req.user` nur mit
  // der ID. Wer hier ein Token hält, hat die Einwilligung beim Anmelden im Web
  // erteilt — ein Widerruf dort erreicht den Konnektor sonst aber nie, und
  // genau das wäre die Lücke. Kein `WWW-Authenticate`: die Anmeldung stimmt,
  // eine erneute OAuth-Runde änderte nichts.
  if (!(await hasAiConsent(authCtx.userId))) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: JSONRPC_CONSENT_REQUIRED,
        message:
          'Für die KI-Funktionen fehlt die ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO. Bitte einmal im Grünerator anmelden und einwilligen.',
      },
      id: null,
    });
    return;
  }

  // Der Privatsphäre-Zähler liest nur req.user.id — no need for a
  // full profile load per call (the augmentation types req.user as UserProfile).
  const reqWithUser = req as unknown as { user?: { id: string } };
  reqWithUser.user ??= { id: authCtx.userId };

  try {
    const server = buildAuthenticatedMcpServer({
      userId: authCtx.userId,
      scopes: authCtx.scopes,
      ...(authCtx.apiKey ? { apiKey: authCtx.apiKey } : {}),
      req,
    });
    // No sessionIdGenerator → stateless mode (exactOptionalPropertyTypes
    // forbids the explicit `sessionIdGenerator: undefined` the SDK docs show).
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log.error('handleRequest failed:', err);
    Sentry.captureException(err, { tags: { mcp_endpoint: 'POST /api/mcp-server' } });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: ErrorCode.InternalError, message: 'Interner Serverfehler' },
        id: null,
      });
    }
  }
});

// Stateless mode: no server-initiated SSE stream, no sessions to terminate.
const methodNotAllowed = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: JSONRPC_METHOD_NOT_ALLOWED,
      message: 'Method not allowed (stateless JSON mode)',
    },
    id: null,
  });
};
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

export default router;
