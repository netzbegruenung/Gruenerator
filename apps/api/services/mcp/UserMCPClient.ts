/**
 * Client for a single user-supplied external MCP server (StreamableHTTP).
 *
 * Wraps the official `@modelcontextprotocol/sdk` Client so the chat backend can
 * connect to arbitrary servers, list their tools and invoke them during the
 * `mcp`-intent tool-loop. One instance = one connection; call {@link close}
 * when done. Every call is bounded by a timeout and never throws out of
 * {@link listTools}/{@link callTool} in a way the loop can't recover from —
 * failures are surfaced as structured results so a flaky user server degrades
 * gracefully instead of killing the turn.
 *
 * Auth: `none` (no header) and `bearer`/`oauth` (an access token in the
 * Authorization header). The interactive OAuth (PKCE/DCR) flow lives in
 * McpOAuthService; by the time this client connects, `oauth` means "a valid
 * access token was resolved" (lazy-refreshed via getValidAccessToken).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('user-mcp-client');

/** Pull `resource` (embedded) and `resource_link` blocks out of a tool result's
 *  content array — this is where a `ui://…` MCP-Apps widget pointer arrives. */
function extractResultResources(blocks: unknown[]): McpResultResource[] {
  const out: McpResultResource[] = [];
  for (const b of blocks) {
    const block = b as {
      type?: string;
      uri?: string;
      mimeType?: string;
      resource?: { uri?: string; mimeType?: string; text?: string; blob?: string };
    };
    if (block.type === 'resource' && block.resource?.uri) {
      out.push({
        uri: block.resource.uri,
        ...(block.resource.mimeType ? { mimeType: block.resource.mimeType } : {}),
        ...(block.resource.text != null ? { text: block.resource.text } : {}),
        ...(block.resource.blob != null ? { blob: block.resource.blob } : {}),
      });
    } else if (block.type === 'resource_link' && block.uri) {
      out.push({ uri: block.uri, ...(block.mimeType ? { mimeType: block.mimeType } : {}) });
    }
  }
  return out;
}

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 30_000;
/** Untrusted servers can return huge blobs; cap what we feed back to the model. */
const MAX_TOOL_RESULT_CHARS = 20_000;

export interface McpConnectionConfig {
  /** Registry row id — used to namespace tools as `${id}__${toolName}`. */
  id: string;
  name: string;
  url: string;
  authType: 'none' | 'bearer' | 'oauth';
  /** Decrypted access token for bearer/oauth. */
  token?: string | null;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Output shape when the server declares one (MCP-Apps widgets rely on it). */
  outputSchema?: Record<string, unknown>;
  /** Tool `_meta` — carries the MCP-Apps `ui.resourceUri` and the OpenAI Apps
   *  SDK `openai/outputTemplate` widget pointers. Dropped historically. */
  meta?: Record<string, unknown>;
}

/** A resource attached to a tool result — an MCP-Apps `ui://…` widget pointer
 *  (embedded or linked). */
export interface McpResultResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpCallResult {
  ok: boolean;
  /** Stringified tool output (text blocks joined), capped. */
  content: string;
  /** Structured tool output (`structuredContent`) — the data an MCP-Apps widget
   *  renders. Preserved separately from the flattened text. */
  structuredContent?: Record<string, unknown>;
  /** Result `_meta` (e.g. OpenAI Apps SDK `openai/outputTemplate`). */
  meta?: Record<string, unknown>;
  /** Embedded / linked resources from the result (`ui://…` widget refs). */
  resources?: McpResultResource[];
}

/** A resource listed by / read from an MCP server (`resources/list`, `resources/read`). */
export interface McpResource {
  uri: string;
  name?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  /** Resource `_meta` — an MCP-Apps widget carries its CSP here (`ui.csp` /
   *  `openai/widgetCSP`). */
  meta?: Record<string, unknown>;
}

export class UserMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;

  constructor(private readonly config: McpConnectionConfig) {}

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  private buildTransport(): StreamableHTTPClientTransport | SSEClientTransport {
    const headers: Record<string, string> = {};
    if (
      (this.config.authType === 'bearer' || this.config.authType === 'oauth') &&
      this.config.token
    ) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }
    const url = new URL(this.config.url);
    // Many official servers only expose the legacy SSE transport (URL ends in
    // `/sse`); the rest use StreamableHTTP. Pick by URL so both connect. For SSE
    // the auth header must ride both the POST (requestInit) and the GET event
    // stream (eventSourceInit.fetch), since EventSource can't set headers itself.
    if (url.pathname.endsWith('/sse')) {
      return new SSEClientTransport(url, {
        requestInit: { headers },
        eventSourceInit: {
          fetch: (input: string | URL | Request, init?: RequestInit) =>
            fetch(input, {
              ...init,
              headers: { ...(init?.headers as Record<string, string>), ...headers },
            }),
        },
      });
    }
    return new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  }

  /** Connect and complete the MCP initialize handshake. Throws on failure. */
  async connect(): Promise<void> {
    // SSRF guard at the connect chokepoint: the server URL is user-provided, so
    // re-validate on every connect (not just at create time — DNS can rebind to
    // an internal address between). Blocks localhost/private IPs/metadata hosts.
    const urlCheck = await validateUrlForFetch(this.config.url);
    if (!urlCheck.isValid) {
      throw new Error(
        `Unsichere MCP-Server-URL (${this.config.name}): ${urlCheck.error ?? 'blockiert'}`
      );
    }
    this.client = new Client({ name: 'gruenerator-chat', version: '1.0.0' }, { capabilities: {} });
    this.transport = this.buildTransport();
    // The SDK's concrete transport types `sessionId` as `string | undefined`,
    // which trips exactOptionalPropertyTypes against the `Transport` interface
    // (`sessionId?: string`). Boundary cast at the SDK edge — structurally sound.
    await this.client.connect(this.transport as unknown as Transport, {
      timeout: CONNECT_TIMEOUT_MS,
    });
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    if (!this.client) throw new Error('UserMCPClient.listTools called before connect()');
    const result = await this.client.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
    return (result.tools ?? []).map((t) => {
      const raw = t as {
        outputSchema?: Record<string, unknown>;
        _meta?: Record<string, unknown>;
      };
      return {
        name: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
          type: 'object',
          properties: {},
        },
        ...(raw.outputSchema ? { outputSchema: raw.outputSchema } : {}),
        ...(raw._meta ? { meta: raw._meta } : {}),
      };
    });
  }

  /**
   * Invoke a tool. Never throws — returns `{ ok:false, content }` on error so
   * the tool-loop can feed the failure back to the model and let it recover.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    // System sources condense oversized results themselves (e.g. DB IRIS
    // timetables, ~46k chars) — they need the full payload before shrinking it.
    opts?: { maxChars?: number }
  ): Promise<McpCallResult> {
    if (!this.client) return { ok: false, content: 'MCP-Client nicht verbunden.' };
    try {
      const result = await this.client.callTool({ name: toolName, arguments: args }, undefined, {
        timeout: CALL_TIMEOUT_MS,
      });
      const blocks = Array.isArray(result.content) ? result.content : [];
      const text = blocks
        .map((b) => {
          const block = b as { type?: string; text?: string };
          if (block.type === 'text' && typeof block.text === 'string') return block.text;
          return JSON.stringify(b);
        })
        .join('\n')
        .slice(0, opts?.maxChars ?? MAX_TOOL_RESULT_CHARS);
      const isError = (result as { isError?: boolean }).isError === true;
      // Preserve the structured/metadata channels the model-facing text drops —
      // MCP-Apps widgets render from `structuredContent` and locate their HTML
      // via result `_meta` / embedded `ui://` resource blocks.
      const resources = extractResultResources(blocks);
      const structuredContent = (result as { structuredContent?: Record<string, unknown> })
        .structuredContent;
      const meta = (result as { _meta?: Record<string, unknown> })._meta;
      return {
        ok: !isError,
        content: text || (isError ? 'Tool meldete einen Fehler.' : ''),
        ...(structuredContent ? { structuredContent } : {}),
        ...(meta ? { meta } : {}),
        ...(resources.length > 0 ? { resources } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('MCP tool call failed', { server: this.config.name, tool: toolName, message });
      return { ok: false, content: `Fehler beim Aufruf von ${toolName}: ${message}` };
    }
  }

  /** List the server's resources (`resources/list`). Empty on failure. */
  async listResources(): Promise<McpResource[]> {
    if (!this.client) throw new Error('UserMCPClient.listResources called before connect()');
    try {
      const result = await this.client.listResources(undefined, { timeout: CALL_TIMEOUT_MS });
      return (result.resources ?? []).map((r) => ({
        uri: r.uri,
        ...(r.name ? { name: r.name } : {}),
        ...(r.mimeType ? { mimeType: r.mimeType } : {}),
      }));
    } catch (err) {
      log.warn('MCP listResources failed', {
        server: this.config.name,
        message: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /** Read a single resource by URI (`resources/read`) — the MCP-Apps widget
   *  HTML lives behind a `ui://…` URI. Returns null on failure. */
  async readResource(uri: string): Promise<McpResource | null> {
    if (!this.client) throw new Error('UserMCPClient.readResource called before connect()');
    try {
      const result = await this.client.readResource({ uri }, { timeout: CALL_TIMEOUT_MS });
      const contents = Array.isArray(result.contents) ? result.contents : [];
      const match =
        contents.find((c) => (c as { uri?: string }).uri === uri) ?? contents[0] ?? null;
      if (!match) return null;
      const c = match as {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
        _meta?: Record<string, unknown>;
      };
      return {
        uri: c.uri,
        ...(c.mimeType ? { mimeType: c.mimeType } : {}),
        ...(c.text != null ? { text: c.text } : {}),
        ...(c.blob != null ? { blob: c.blob } : {}),
        ...(c._meta ? { meta: c._meta } : {}),
      };
    } catch (err) {
      log.warn('MCP readResource failed', {
        server: this.config.name,
        uri,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.transport) await this.transport.close();
    } catch {
      /* best effort */
    } finally {
      this.client = null;
      this.transport = null;
    }
  }
}
