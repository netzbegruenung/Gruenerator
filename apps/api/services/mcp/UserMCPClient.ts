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
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('user-mcp-client');

/** Which wire protocol carried the session. */
export type McpTransportKind = 'http' | 'sse';

/**
 * Deliberately permissive `tools/list` shape — see {@link UserMCPClient.listTools}.
 * The SDK's `safeParse` shim accepts zod v3 and v4 schemas alike, so this stays
 * in the repo's zod 3 idiom.
 */
const LenientListToolsResultSchema = z
  .object({
    // `z.unknown()` und nicht `z.record(...)`: ein einzelner nicht-objekthafter
    // Eintrag (null, ein String) hätte sonst das Array-Parsing zum Scheitern
    // gebracht — und damit wieder die ganze Seite verworfen, also genau das,
    // wogegen dieses Schema antritt. Aussortiert wird pro Eintrag, nicht pro
    // Antwort.
    tools: z.array(z.unknown()).optional(),
    nextCursor: z.string().optional(),
  })
  .passthrough();

/** Bounds on a stranger's tool list: pages followed, tools accepted. */
const MAX_TOOL_PAGES = 10;
const MAX_LISTED_TOOLS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Repair one raw tool entry into something the loop can mount. Only a missing
 * name is fatal — an absent or mistyped `inputSchema` becomes the empty object
 * schema, which is what a parameterless tool looks like anyway.
 */
function normalizeToolDescriptor(entry: unknown): McpToolDescriptor | null {
  const raw = asRecord(entry);
  if (!raw) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;

  const rawSchema = asRecord(raw.inputSchema);
  const inputSchema: Record<string, unknown> = rawSchema
    ? { ...rawSchema, type: 'object', properties: asRecord(rawSchema.properties) ?? {} }
    : { type: 'object', properties: {} };

  const outputSchema = asRecord(raw.outputSchema);
  const meta = asRecord(raw._meta);
  // Only `readOnlyHint`, and only when it is a real boolean: a server that sends
  // the string "true" gets no say. The other three spec hints (destructive,
  // idempotent, openWorld) are deliberately NOT carried — nothing reads them,
  // and a field with no consumer is the defect #3095 was filed for.
  const annotations = asRecord(raw.annotations);
  const readOnlyHint =
    typeof annotations?.readOnlyHint === 'boolean' ? annotations.readOnlyHint : null;
  return {
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    ...(meta ? { meta } : {}),
    ...(readOnlyHint != null ? { readOnlyHint } : {}),
  };
}

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
  /**
   * Approved tool-definition fingerprints from `mcp_servers.tool_fingerprints`.
   * Carried on the config so the catalog can diff without a second query.
   * `null`/absent = no baseline yet; that load records one instead of blocking
   * (see services/mcp/mcpToolDrift.ts).
   */
  approvedFingerprints?: Record<string, string> | null;
  /**
   * A first-party MANAGED connector (`system-<key>`, config from env) rather
   * than an `mcp_servers` row. Two consequences the catalog MUST honour: there
   * is no row to write a tools snapshot or a fingerprint baseline to (the id is
   * not a UUID, so the write fails at the column cast), and the rug-pull check
   * is moot because we operate the server ourselves.
   */
  managed?: boolean;
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
  /**
   * `annotations.readOnlyHint` as the server sent it — a CLAIM, not a fact. The
   * MCP spec is explicit that a client must not trust annotations from an
   * untrusted server, so this is carried as far as `approvalPolicy.ts` and acted
   * on ONLY for first-party managed connectors. Absent = the server said
   * nothing, which is not the same as `false`.
   */
  readOnlyHint?: boolean;
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
  private activeTransport: McpTransportKind | null = null;
  private negotiatedProtocolVersion: string | null = null;
  private lastSkippedTools = 0;
  private lastTruncatedTools = 0;

  constructor(private readonly config: McpConnectionConfig) {}

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  /** Which transport actually completed the handshake (for diagnostics). */
  get transportKind(): McpTransportKind | null {
    return this.activeTransport;
  }

  /** Protocol version the server negotiated, when the transport reports one. */
  get protocolVersion(): string | null {
    return this.negotiatedProtocolVersion;
  }

  /**
   * Whether the server declared a `tools` capability at all. Separates "bietet
   * keine Werkzeuge an" from "bietet welche an, gibt aber keine heraus" — zwei
   * Fälle, die als leere Liste identisch aussehen und verschiedene Abhilfen
   * haben.
   */
  get declaresTools(): boolean {
    return this.client?.getServerCapabilities()?.tools != null;
  }

  /** Entries the last {@link listTools} dropped as unusable (no name, no object). */
  get skippedTools(): number {
    return this.lastSkippedTools;
  }

  /** Tools the last {@link listTools} cut off at the cap. Never silent. */
  get truncatedTools(): number {
    return this.lastTruncatedTools;
  }

  private authHeaders(): Record<string, string> {
    if (
      (this.config.authType === 'bearer' || this.config.authType === 'oauth') &&
      this.config.token
    ) {
      return { Authorization: `Bearer ${this.config.token}` };
    }
    return {};
  }

  private buildTransport(
    kind: McpTransportKind
  ): StreamableHTTPClientTransport | SSEClientTransport {
    const headers = this.authHeaders();
    const url = new URL(this.config.url);
    // For SSE the auth header must ride both the POST (requestInit) and the GET
    // event stream (eventSourceInit.fetch), since EventSource can't set headers
    // itself.
    if (kind === 'sse') {
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

  /**
   * Connect and complete the MCP initialize handshake. Throws on failure.
   *
   * Both transports are tried: the URL path only tells us which one to try
   * FIRST. Guessing from the path alone (as this did) puts a `/sse/`-with-slash
   * or an unconventionally routed endpoint on the wrong transport and reports
   * the server as unreachable — every other MCP client falls back instead.
   */
  async connect(): Promise<void> {
    // A missing token used to connect ANONYMOUSLY: a failed OAuth refresh or a
    // token that won't decrypt left `token: null`, and servers that answer an
    // unauthenticated session with an empty tool list instead of a 401 then look
    // like "connected, 0 tools". Say what actually happened. Checked first
    // because it touches no network at all — the SSRF guard below still gates
    // every connection that is actually opened.
    if (
      (this.config.authType === 'bearer' || this.config.authType === 'oauth') &&
      !this.config.token
    ) {
      throw new Error(
        `Für „${this.config.name}" liegt kein gültiger Zugang vor — bitte den Server neu ` +
          `autorisieren bzw. das Token erneut hinterlegen.`
      );
    }
    // SSRF guard at the connect chokepoint: the server URL is user-provided, so
    // re-validate on every connect (not just at create time — DNS can rebind to
    // an internal address between). Blocks localhost/private IPs/metadata hosts.
    const urlCheck = await validateUrlForFetch(this.config.url);
    if (!urlCheck.isValid) {
      throw new Error(
        `Unsichere MCP-Server-URL (${this.config.name}): ${urlCheck.error ?? 'blockiert'}`
      );
    }

    // Trailing slash tolerated: `https://host/sse/` is the same hint as `/sse`.
    const path = new URL(this.config.url).pathname.replace(/\/+$/, '');
    const order: McpTransportKind[] = path.endsWith('/sse') ? ['sse', 'http'] : ['http', 'sse'];

    let firstError: unknown = null;
    for (const kind of order) {
      // A fresh Client per attempt — a half-completed handshake leaves the
      // previous one unusable.
      const client = new Client(
        { name: 'gruenerator-chat', version: '1.0.0' },
        { capabilities: {} }
      );
      const transport = this.buildTransport(kind);
      try {
        // The SDK's concrete transport types `sessionId` as `string | undefined`,
        // which trips exactOptionalPropertyTypes against the `Transport` interface
        // (`sessionId?: string`). Boundary cast at the SDK edge — structurally sound.
        await client.connect(transport as unknown as Transport, { timeout: CONNECT_TIMEOUT_MS });
        this.client = client;
        this.transport = transport;
        this.activeTransport = kind;
        this.negotiatedProtocolVersion =
          (transport as { protocolVersion?: string }).protocolVersion ?? null;
        if (kind !== order[0]) {
          log.info('MCP connected via fallback transport', {
            server: this.config.name,
            transport: kind,
          });
        }
        return;
      } catch (err) {
        firstError ??= err;
        log.warn('MCP connect attempt failed', {
          server: this.config.name,
          transport: kind,
          message: err instanceof Error ? err.message : String(err),
        });
        await transport.close().catch(() => {});
      }
    }
    throw firstError instanceof Error ? firstError : new Error(String(firstError));
  }

  /**
   * List the server's tools — tolerantly, and across all pages.
   *
   * NOT `client.listTools()`: that parses the response with the SDK's strict
   * `ToolSchema`, which requires `inputSchema` and pins it to `type: "object"`.
   * `safeParse` rejects the WHOLE response on the first offending entry, so a
   * single hand-written tool costs the user every tool on the server — while
   * nachsichtige Clients (ChatGPT) show them all. We take the raw result and
   * repair each tool ourselves; only an entry without a usable name is dropped,
   * and that is counted and logged rather than swallowed.
   *
   * Consequence to be aware of: `client.listTools()` also fills the SDK's cache
   * of output schemas, which `callTool` uses to validate `structuredContent`.
   * Going through `client.request` skips that cache — `callTool` gets more
   * lenient, never stricter.
   */
  async listTools(): Promise<McpToolDescriptor[]> {
    if (!this.client) throw new Error('UserMCPClient.listTools called before connect()');
    const out: McpToolDescriptor[] = [];
    let skipped = 0;
    let truncated = 0;
    let cursor: string | undefined;
    let page = 0;

    do {
      const result = await this.client.request(
        { method: 'tools/list', params: cursor ? { cursor } : {} },
        LenientListToolsResultSchema,
        { timeout: CALL_TIMEOUT_MS }
      );
      page++;
      const entries = result.tools ?? [];
      for (let i = 0; i < entries.length; i++) {
        // Abgeschnittenes wird GEZÄHLT, nicht stillschweigend verworfen: ein
        // blankes `break` hätte hier exakt den Fehler wiederholt, gegen den
        // diese Methode antritt — nur eine Ebene tiefer.
        //
        // Gezählt wird der Rest DIESER Seite (`entries.length - i`). Die erste
        // Fassung rechnete `entries.length - out.length - skipped` und mischte
        // damit einen seitenlokalen mit zwei über alle Seiten kumulierten
        // Zählern: griff der Deckel erst ab Seite 2, kam eine negative Zahl
        // heraus — und `truncated > 0` unterdrückte dann sogar den Warn-Log.
        if (out.length >= MAX_LISTED_TOOLS) {
          truncated += entries.length - i;
          break;
        }
        const tool = normalizeToolDescriptor(entries[i]);
        if (tool) out.push(tool);
        else skipped++;
      }
      cursor = result.nextCursor;
    } while (cursor && page < MAX_TOOL_PAGES && out.length < MAX_LISTED_TOOLS);

    if (cursor || truncated > 0) {
      log.warn('MCP tools/list truncated', {
        server: this.config.name,
        pages: page,
        tools: out.length,
        // Über alle Seiten summiert, nicht nur die letzte — der alte Name
        // behauptete eine Seitenbindung, die die Zahl nie hatte.
        droppedByCap: truncated,
        morePagesPending: Boolean(cursor),
      });
    }
    if (skipped > 0) {
      log.warn('MCP tools/list entries skipped (not a tool object / no usable name)', {
        server: this.config.name,
        skipped,
      });
    }
    this.lastSkippedTools = skipped;
    this.lastTruncatedTools = truncated;
    return out;
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
      // An application-level tool error (isError:true, e.g. Tally "no workspace"
      // / auth) previously returned silently — only transport throws logged. Log
      // it so a genuine remote failure is visible in the backend, not just
      // inferred from a hallucinated chat answer.
      if (isError) {
        log.warn('MCP tool returned an error', {
          server: this.config.name,
          tool: toolName,
          content: text.slice(0, 300),
        });
      }
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
      this.activeTransport = null;
    }
  }
}
