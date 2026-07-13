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
 * v1 auth: `none` (no header) and `bearer`/`oauth` (a static access token in the
 * Authorization header). The interactive OAuth (PKCE/DCR) flow is out of scope;
 * `oauth` here just means "an access token was already stored".
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('user-mcp-client');

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
}

export interface McpCallResult {
  ok: boolean;
  /** Stringified tool output (text blocks joined), capped. */
  content: string;
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
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    }));
  }

  /**
   * Invoke a tool. Never throws — returns `{ ok:false, content }` on error so
   * the tool-loop can feed the failure back to the model and let it recover.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpCallResult> {
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
        .slice(0, MAX_TOOL_RESULT_CHARS);
      const isError = (result as { isError?: boolean }).isError === true;
      return { ok: !isError, content: text || (isError ? 'Tool meldete einen Fehler.' : '') };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('MCP tool call failed', { server: this.config.name, tool: toolName, message });
      return { ok: false, content: `Fehler beim Aufruf von ${toolName}: ${message}` };
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
