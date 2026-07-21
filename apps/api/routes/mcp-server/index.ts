/**
 * Authenticated MCP endpoint (POST /api/mcp-server; public URL
 * mcp.gruenerator.eu/v2 via nginx).
 *
 * NOT to be confused with routes/mcp/ — that is the user-managed OUTBOUND MCP
 * client registry (Grünerator connecting to external servers). This directory
 * is Grünerator acting as an MCP SERVER for external clients (claude.ai,
 * Claude Code, Cursor …), authenticated via OAuth (Better Auth `mcp` plugin)
 * or an admin-minted API key.
 *
 * Stateless streamable HTTP JSON: a fresh McpServer per POST (same
 * claude.ai/ChatGPT-compat pattern as services/mcp) — required so session-less
 * tool discovery works and per-user/per-scope tool registration stays trivial.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env.js';
import { MCP_RESOURCE_URL } from '../../config/mcpServer.js';
import { createLogger } from '../../utils/logger.js';

import { resolveMcpAuth } from './mcpAuth.js';
import { buildAuthenticatedMcpServer } from './serverFactory.js';

const log = createLogger('McpServer');

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
          error: { code: -32029, message: 'Zu viele Anfragen – bitte kurz warten.' },
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
      error: { code: -32000, message: 'Unauthorized: Authentication required' },
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

  // aiWorkerPool's privacy counter reads only req.user.id — a minimal user
  // stub is the boundary here, not a full profile load per tool call (the
  // global Express augmentation types req.user as the full UserProfile).
  const reqWithUser = req as unknown as { user?: { id: string } };
  reqWithUser.user ??= { id: authCtx.userId };

  try {
    const server = buildAuthenticatedMcpServer({
      userId: authCtx.userId,
      scopes: authCtx.scopes,
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
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interner Serverfehler' },
        id: null,
      });
    }
  }
});

// Stateless mode: no server-initiated SSE stream, no sessions to terminate.
const methodNotAllowed = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed (stateless JSON mode)' },
    id: null,
  });
};
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

export default router;
