/**
 * Republishes the chat agentic-loop tools (ai-SDK `tool()` factories) as MCP
 * tools with a neutral context. The chat factories fail safe here by design:
 * their SSE-confirm branches are threadId-gated and return a clean error when
 * threadId is null — those actions get MCP-native `overrides` (mcpMutations.ts).
 */
import { z } from 'zod';

import { APP_BASE_URL } from '../../config/mcpServer.js';
import { Sentry } from '../../lib/sentry.js';
import { createLogger } from '../../utils/logger.js';

import type { PersonalToolCtx } from '../chat/agents/personalDataTools.js';
import type { SourceRegistry } from '../chat/services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../chat/services/sseHelpers.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from 'ai';

const noopRegistry: SourceRegistry = {
  register: () => '',
  seedCarried: () => {},
  getResults: () => [],
  renderAll: () => '',
  renderReference: () => '',
  getCitations: () => [],
  size: 0,
};

// No personal-data tool reaches an sse call without a threadId; this only
// satisfies the ctx shape.
const noopSse = {
  send: () => {},
  sendRaw: () => {},
  end: () => {},
  isEnded: () => true,
} as unknown as SSEWriter;

/**
 * The factories read only `state.agentConfig.userId` on paths reachable
 * without a threadId, so the skeleton state is a true boundary cast.
 */
export function makeMcpPersonalCtx(userId: string): PersonalToolCtx {
  return {
    state: { agentConfig: { userId } } as unknown as PersonalToolCtx['state'],
    sse: noopSse,
    threadId: null,
    sourceRegistry: noopRegistry,
  };
}

const log = createLogger('McpToolBridge');

/** Relative SPA paths (`/office/…`, `/boards/…`) are useless outside the app. */
export function absolutizeUrl(url: string): string {
  return url.startsWith('/') ? `${APP_BASE_URL}${url}` : url;
}

interface ResultRowLike {
  title?: string;
  url?: string;
  snippet?: string;
  type?: string;
  ref?: string;
}

function formatRows(rows: ResultRowLike[]): string {
  return rows
    .map((r) => {
      const parts = [`**${r.title ?? '(ohne Titel)'}**`];
      if (r.type) parts.push(`(${r.type})`);
      if (r.snippet) parts.push(`— ${r.snippet}`);
      if (r.url) parts.push(`— ${absolutizeUrl(r.url)}`);
      if (r.ref) parts.push(`[ref: ${r.ref}]`);
      return `- ${parts.join(' ')}`;
    })
    .join('\n');
}

/** Recursively absolutize url/href-ish string fields for the JSON fallback. */
function absolutizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(absolutizeDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        (k === 'url' || k === 'href') && typeof v === 'string'
          ? absolutizeUrl(v)
          : absolutizeDeep(v);
    }
    return out;
  }
  return value;
}

/**
 * Render a chat-tool return value as MCP text content. Known shapes
 * (`{error}`, `{needsConfirmation,note}`, `{ok,note}`, `{results:[…]}`) get
 * markdown; everything else falls back to pretty JSON.
 */
export function formatToolResult(result: unknown): { text: string; isError: boolean } {
  if (result == null) return { text: 'Kein Ergebnis.', isError: true };
  if (typeof result === 'string') return { text: result, isError: false };

  const r = result as Record<string, unknown>;
  if (typeof r.error === 'string') return { text: r.error, isError: true };
  // Search executors signal failure with `error: true` + `message`.
  if (r.error === true) {
    return {
      text: typeof r.message === 'string' ? r.message : 'Anfrage fehlgeschlagen.',
      isError: true,
    };
  }
  if (r.needsConfirmation === true && typeof r.note === 'string') {
    return { text: `⚠️ Bestätigung erforderlich: ${r.note}`, isError: false };
  }
  if (typeof r.note === 'string' && r.ok === true) return { text: r.note, isError: false };
  if (Array.isArray(r.results)) {
    const rows = r.results as ResultRowLike[];
    if (rows.length === 0) return { text: 'Keine Treffer.', isError: false };
    return { text: formatRows(rows), isError: false };
  }
  return { text: JSON.stringify(absolutizeDeep(result), null, 2), isError: false };
}

export interface RegisterAiToolOptions {
  /** MCP-tuned description; defaults to the chat tool's description. */
  description?: string;
  title?: string;
  /** Narrow (or extend, together with `extraShape`) the `action` enum. */
  actions?: [string, ...string[]];
  /** Additional input fields (e.g. `query` for the notebooks search action). */
  extraShape?: z.ZodRawShape;
  /** MCP-native handlers keyed by action — intercepted before the chat tool runs. */
  overrides?: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  readOnly?: boolean;
}

export function registerAiTool(
  server: McpServer,
  name: string,
  aiTool: Tool,
  opts: RegisterAiToolOptions = {}
): void {
  const schema = aiTool.inputSchema as z.ZodObject<z.ZodRawShape>;
  const shape: z.ZodRawShape = { ...schema.shape, ...(opts.extraShape ?? {}) };
  if (opts.actions) {
    // Action lists have no compile-time link to the chat tool's enum — catch
    // drift at registration. Extra actions need an override implementing them.
    const original = schema.shape.action;
    if (original instanceof z.ZodEnum) {
      const known = new Set<string>(original.options as string[]);
      for (const action of opts.actions) {
        if (!known.has(action) && !opts.overrides?.[action]) {
          throw new Error(`MCP tool ${name}: action "${action}" has no implementation`);
        }
      }
    }
    shape.action = z.enum(opts.actions);
  }

  server.registerTool(
    name,
    {
      ...(opts.title ? { title: opts.title } : {}),
      description: opts.description ?? aiTool.description ?? name,
      inputSchema: shape,
      annotations: {
        readOnlyHint: opts.readOnly ?? false,
        destructiveHint: !(opts.readOnly ?? false),
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => {
      let raw: unknown;
      try {
        const action = typeof args.action === 'string' ? args.action : null;
        const override = action ? opts.overrides?.[action] : undefined;
        raw = override
          ? await override(args)
          : await aiTool.execute!(args, { toolCallId: `mcp-${name}`, messages: [] });
      } catch (err) {
        // Never leak raw driver/service errors (e.g. Postgres uuid-cast noise
        // from hallucinated ids) to external MCP clients.
        log.error(`tool ${name} failed:`, err);
        Sentry.captureException(err, { tags: { mcp_tool: name } });
        raw = { error: 'Aktion fehlgeschlagen — prüfe die übergebenen IDs.' };
      }
      const { text, isError } = formatToolResult(raw);
      return { content: [{ type: 'text' as const, text }], ...(isError ? { isError } : {}) };
    }
  );
}
