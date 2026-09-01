/**
 * Mounts the first-party MANAGED connectors (Deutsche Bahn, Open-Meteo/DWD,
 * ARD-Tagesschau, trivago, Bundesrecht) as agentic-loop tools — the built-in
 * counterpart to mcpCatalog's per-user connectors. Fixed env configs
 * (systemMcpServers.ts), no registry, no snapshot writes.
 *
 * SELECTION used to be by INTENT (`a bahn turn mounts the Bahn tools`). It is
 * now by KEY, and the keys come from either the vocabulary trigger
 * (`managedSourceTrigger`) or an explicit `@mention` scope. That is what lets a
 * single turn mount train AND hotel tools — the case the `reise` umbrella intent
 * existed for, back when the answer had to be one intent.
 *
 * ── LAZY CONNECT ────────────────────────────────────────────────────────────
 *
 * Mounting no longer opens a connection. `client.connect()` costs a DNS + SSRF
 * revalidation and up to CONNECT_TIMEOUT_MS, and it used to run BEFORE
 * `streamText` started — acceptable while only a `wetter` turn paid it, not once
 * several connectors mount on ordinary turns. The tool DEFINITIONS come from
 * `toolListCache` (10 min); the connection is opened on the first actual call,
 * inside `execute`. A mount whose tools the model never calls now costs nothing
 * but tokens.
 *
 * Cold cache is the exception and cannot be avoided: with no cached descriptors
 * there is nothing to build a tool from, so that one load connects and lists —
 * and hands the open client to the lazy holder so the first call reuses it.
 *
 * NOT a process-wide connection pool. That would save the per-turn handshake
 * too, but a shared client needs its own failure/reconnect handling and
 * process-wide call serialization; the mount-time cost is the part that hurt
 * every turn, and this removes it. Measure before going further.
 *
 * Per-source result handling on top of the raw dynamicTool passthrough:
 * - bahn: DB IRIS timetable JSON (~46k chars/hour) is condensed to a compact
 *   departure board — same object grounds the model, feeds the `bahn` SSE card
 *   and lands in the persisted step result.
 * - news: tagesschau markdown results register `SearchResult`s in the turn's
 *   sourceRegistry so answers get the standard [N] citation footer.
 */
import { bahnPayloadSchema, type BahnEntry, type BahnPayload } from '@gruenerator/contracts';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';

import { type SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import { McpServerRegistry } from '../../../services/mcp/McpServerRegistry.js';
import {
  getManagedConnectors,
  toSystemConnectionConfig,
  type SystemMcpKey,
  type SystemMcpSource,
} from '../../../services/mcp/systemMcpServers.js';
import { UserMCPClient, type McpToolDescriptor } from '../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { type ToolLabel } from '../services/agenticLoop/types.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import {
  createSerializer,
  requiredParams,
  requiredParamsAnnotation,
  sanitizeToolName,
  type McpCatalog,
} from './mcpCatalog.js';
import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';

const log = createLogger('managedMcpCatalog');

/** Oversized results are condensed here, not clipped mid-JSON by the client. */
const RAW_RESULT_MAX_CHARS = 400_000;
/**
 * Every value postProcess returns must stay UNDER the loop's model budget
 * (wrapTools truncateResultForModel, 6000 chars): once an object exceeds it,
 * deepTruncate slices each string LEAF to ~750 chars — which would shred the
 * bahn board mid-JSON and clip the news [N]-citation block. Staying below the
 * threshold means the model always sees the complete, untruncated result.
 */
// Raised with the retrieval caps: 5k truncated a news or timetable payload
// mid-list. The numbered source block is protected separately below, so this
// only bounds the raw remainder.
const MODEL_RESULT_MAX_CHARS = 25_000;
const ERROR_MAX_CHARS = 2_000;
// ~15 entries ≈ 3-4k chars serialized — complete for the model AND more than
// the card renders (8 rows + "+N weitere").
const CONDENSED_MAX_ENTRIES = 15;
const NEWS_MAX_CITATIONS = 10;

// ── MCP-Apps widget detection (system sources only) ──────────────────────────

/** Lightweight widget pointer carried on the tool result → SSE → client. The
 *  HTML itself is fetched on demand via the `/api/mcp-apps` route (not persisted
 *  here), so the step result stays small and thread reloads re-fetch cleanly. */
export interface SystemWidgetPointer {
  serverKey: SystemMcpKey;
  toolName: string;
  uri: string;
  /** The structured data the widget renders (seeds `window.openai.toolOutput`). */
  structuredContent?: Record<string, unknown>;
}

/** Detect a `ui://…` widget pointer from a tool's `_meta`, the result `_meta`,
 *  or an embedded/linked resource — covering both the OpenAI Apps SDK
 *  (`openai/outputTemplate`) and MCP-Apps (`ui.resourceUri`) conventions. */
export function resolveWidgetUri(
  toolMeta: Record<string, unknown> | undefined,
  resultMeta: Record<string, unknown> | undefined,
  resources: { uri: string }[] | undefined
): string | null {
  const fromMeta = (m: Record<string, unknown> | undefined): string | null => {
    if (!m) return null;
    const tmpl = m['openai/outputTemplate'];
    if (typeof tmpl === 'string' && tmpl.startsWith('ui://')) return tmpl;
    const ui = m.ui as { resourceUri?: unknown } | undefined;
    if (ui && typeof ui.resourceUri === 'string' && ui.resourceUri.startsWith('ui://'))
      return ui.resourceUri;
    return null;
  };
  return (
    fromMeta(resultMeta) ??
    fromMeta(toolMeta) ??
    resources?.find((r) => r.uri.startsWith('ui://'))?.uri ??
    null
  );
}

// listTools is stable per deployment of a first-party server — cache it so hot
// turns skip one round-trip (connect still happens per turn for the calls).
const TOOL_LIST_TTL_MS = 10 * 60_000;
const toolListCache = new Map<SystemMcpKey, { at: number; tools: McpToolDescriptor[] }>();

// ── Bahn: DB IRIS timetable condenser ────────────────────────────────────────

/** IRIS planned time "2607170912" (YYMMDDHHmm) → "09:12", else null. */
function irisTime(pt: unknown): string | null {
  if (typeof pt !== 'string' || pt.length !== 10) return null;
  return `${pt.slice(6, 8)}:${pt.slice(8, 10)}`;
}

/** IRIS "2607170912" → ISO date "2026-07-17", else null. */
function irisDate(pt: unknown): string | null {
  if (typeof pt !== 'string' || pt.length !== 10) return null;
  return `20${pt.slice(0, 2)}-${pt.slice(2, 4)}-${pt.slice(4, 6)}`;
}

interface IrisStop {
  '@id'?: string;
  tl?: { '@c'?: string; '@n'?: string };
  ar?: { '@pt'?: string; '@pp'?: string; '@l'?: string; '@ppth'?: string };
  dp?: { '@pt'?: string; '@pp'?: string; '@l'?: string; '@ppth'?: string };
}

/**
 * Condense a `get_planned_timetable` IRIS result to a departure board. Returns
 * null when the text isn't the expected shape (caller passes raw through).
 */
export function condenseBahnTimetable(text: string): BahnPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const root = parsed as { '@station'?: string; s?: IrisStop[] };
  if (typeof root !== 'object' || root === null || !Array.isArray(root.s)) return null;

  const entries: BahnEntry[] = [];
  for (const stop of root.s) {
    if (typeof stop !== 'object' || stop === null) continue;
    const category = stop.tl?.['@c'] ?? '';
    const number = stop.tl?.['@n'] ?? '';
    if (!category && !number) continue;
    const dpPath = (stop.dp?.['@ppth'] ?? '').split('|').filter(Boolean);
    entries.push({
      id: stop['@id'] ?? `${category}${number}`,
      category,
      number,
      line: stop.dp?.['@l'] ?? stop.ar?.['@l'] ?? null,
      departureTime: irisTime(stop.dp?.['@pt']),
      departurePlatform: stop.dp?.['@pp'] ?? null,
      arrivalTime: irisTime(stop.ar?.['@pt']),
      arrivalPlatform: stop.ar?.['@pp'] ?? null,
      destination: dpPath.length > 0 ? (dpPath[dpPath.length - 1] ?? null) : null,
      via: dpPath.slice(0, 3),
    });
  }
  if (entries.length === 0) return null;

  entries.sort((a, b) =>
    (a.departureTime ?? a.arrivalTime ?? '99:99').localeCompare(
      b.departureTime ?? b.arrivalTime ?? '99:99'
    )
  );
  // Header date/hour from the EARLIEST departure — the raw stop order is
  // unordered, so "first element" can be a terminating arrival from the
  // previous hour/day. YYMMDDHHmm sorts lexicographically.
  const earliestPt = root.s
    .map((s) => s.dp?.['@pt'] ?? s.ar?.['@pt'])
    .filter((pt): pt is string => typeof pt === 'string' && pt.length === 10)
    .sort()[0];
  return bahnPayloadSchema.parse({
    kind: 'timetable',
    station: root['@station'] ?? 'Unbekannter Bahnhof',
    date: irisDate(earliestPt),
    hour: earliestPt ? earliestPt.slice(6, 8) : null,
    entries: entries.slice(0, CONDENSED_MAX_ENTRIES),
  });
}

const BAHN_TIMETABLE_TOOLS = new Set(['get_planned_timetable']);

// ── News: tagesschau markdown → SearchResult citations ──────────────────────

/**
 * The ARD server returns pre-formatted markdown (`## Title`, date line, links).
 * Extract per-item title + a tagesschau/ARD web URL for citation registration;
 * anything unparseable is simply skipped (the raw text still grounds the model).
 */
export function extractNewsResults(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  const sections = text.split(/\n---\n?/);
  for (const section of sections) {
    const titleMatch = section.match(/^##\s+(.+)$/m);
    if (!titleMatch?.[1]) continue;
    const title = titleMatch[1].trim();
    const url =
      section.match(/https:\/\/www\.tagesschau\.de\/\S+/)?.[0] ??
      section.match(/https:\/\/\S*ardmediathek\S*/)?.[0] ??
      null;
    const dateMatch = section.match(/^\*([^*]+)\*$/m);
    const body = section
      .replace(/^##\s+.+$/m, '')
      .replace(/\s+/g, ' ')
      .trim()
      // 400 left a headline plus two sentences — a follow-up detail question
      // then had nothing behind it.
      .slice(0, 2_000);
    results.push({
      source: 'tagesschau',
      title,
      content: `${dateMatch?.[1] ? `${dateMatch[1]} — ` : ''}${body || title}`,
      ...(url ? { url } : {}),
    });
    if (results.length >= NEWS_MAX_CITATIONS) break;
  }
  return results;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const EMPTY: McpCatalog = {
  tools: {},
  labels: new Map(),
  catalogSummary: '',
  scopedServerMissing: false,
  scopedServerUnreachable: false,
  close: async () => {},
};

/**
 * A connection that is opened on FIRST USE, not at mount.
 *
 * `get()` is idempotent per turn: concurrent tool calls in one step await the
 * same promise instead of racing two handshakes. A failed connect leaves that
 * rejected promise in place for the rest of the turn — retrying per call would
 * pay the timeout again for a server that is already known to be down.
 */
interface LazyConnection {
  get: () => Promise<{ client: UserMCPClient; serialize: ReturnType<typeof createSerializer> }>;
  /** Adopt the client the cold-cache path already opened for `listTools`. */
  adopt: (client: UserMCPClient) => void;
  close: () => Promise<void>;
}

function createLazyConnection(source: SystemMcpSource): LazyConnection {
  let opened: Promise<{
    client: UserMCPClient;
    serialize: ReturnType<typeof createSerializer>;
  }> | null = null;
  let openedClient: UserMCPClient | null = null;

  return {
    get() {
      if (!opened) {
        opened = (async () => {
          const client = new UserMCPClient(toSystemConnectionConfig(source));
          await client.connect();
          openedClient = client;
          log.info(`[managedMcpCatalog] "${source.key}" connected on first call`);
          return { client, serialize: createSerializer() };
        })();
      }
      return opened;
    },
    adopt(client) {
      if (opened) return;
      openedClient = client;
      opened = Promise.resolve({ client, serialize: createSerializer() });
    },
    async close() {
      // `openedClient` is only set after a successful connect, so a pending or
      // rejected `opened` leaves nothing to close — which is the point of not
      // awaiting it here: closing must not wait out a hanging handshake.
      if (!openedClient) return;
      try {
        await openedClient.close();
      } catch (err) {
        // Never rethrow: this runs in the turn's `finally`, and a failed close
        // must not replace the answer the user is waiting for. Logged rather
        // than swallowed, because a close that keeps failing is a leaked
        // connection, and that is invisible from anywhere else.
        log.warn(
          `[managedMcpCatalog] close failed for "${source.key}": ${err instanceof Error ? err.message : err}`
        );
      }
    },
  };
}

/**
 * Load the managed connector(s) named by `keys` as loop tools.
 *
 * `keys` come from the vocabulary trigger or an explicit `@mention` scope;
 * several may mount together. Sources resolve in parallel, and one that cannot
 * be listed is skipped — never fatal, the loop then answers honestly or falls
 * back to web search.
 *
 * Connectors the user switched off are dropped, and so are those whose data does
 * not cover their country. Both filters are applied here rather than at the call
 * site so no caller can forget one.
 */
export async function loadManagedMcpCatalog(params: {
  keys: readonly SystemMcpKey[];
  sse: SSEWriter;
  sourceRegistry: SourceRegistry;
  /** Needed for the per-user opt-out; null (no session) keeps every connector. */
  userId: string | null;
  /** Drops sources that do not cover this user's country (see SOURCE_AUDIENCE). */
  userLocale?: string | null;
}): Promise<McpCatalog> {
  if (params.keys.length === 0) return EMPTY;
  const available = getManagedConnectors(params.userLocale);
  const disabled = params.userId
    ? await McpServerRegistry.getDisabledManagedKeys(params.userId).catch((err: unknown) => {
        // Opposite default to the settings list: there, showing a row is the
        // safe direction; here, mounting a connector somebody switched off is
        // the unsafe one. Skip them all rather than override a decision.
        log.warn(`[managedMcpCatalog] prefs unavailable, skipping managed mounts: ${err}`);
        return null;
      })
    : new Set<string>();
  if (!disabled) return EMPTY;
  const sources = params.keys
    .map((key) => available.find((c) => c.key === key))
    .filter((s): s is (typeof available)[number] => s != null && !disabled.has(s.key));
  if (sources.length === 0) return EMPTY;

  const connections: LazyConnection[] = [];
  const tools: ToolSet = {};
  const labels = new Map<string, ToolLabel>();
  const mountedKeys = new Set<string>();
  // Keyed by source.key for stable ordering (Promise.all resolves out of order).
  const catalogByServer = new Map<string, string>();

  await Promise.all(
    sources.map(async (source) => {
      const lazy = createLazyConnection(source);
      connections.push(lazy);
      try {
        const listed = await listToolsCached(source, lazy);
        mountedKeys.add(source.key);
        const allowed = source.toolAllowlist
          ? listed.filter((t) => source.toolAllowlist?.includes(t.name))
          : listed;

        const toolEntries: string[] = [];
        for (const t of allowed) {
          const providerName = `${source.key}__${sanitizeToolName(t.name)}`.slice(0, 64);
          if (tools[providerName]) continue;
          labels.set(providerName, {
            serverName: source.name,
            toolName: t.name,
            origin: {
              kind: 'managed',
              serverId: source.key,
              remoteToolName: t.name,
              ...(t.readOnlyHint != null ? { readOnlyHint: t.readOnlyHint } : {}),
            },
          });
          const sanitized = sanitizeMcpSchema(t.inputSchema);
          const required = requiredParams(sanitized);
          toolEntries.push(`${t.name} ${requiredParamsAnnotation(required)}`);
          const requiredSuffix =
            required.length > 0 ? ` — Pflichtfelder: ${required.join(', ')}` : '';
          tools[providerName] = dynamicTool({
            description: `[${source.name}] ${t.description ?? ''}${requiredSuffix}`.slice(0, 1024),
            inputSchema: jsonSchema(sanitized),
            execute: async (input) => {
              // THE connection point: opening happens here, on the first real
              // call, not when this tool was put in the catalog.
              let conn;
              try {
                conn = await lazy.get();
              } catch (err) {
                return {
                  error: `Der Dienst ${source.name} ist gerade nicht erreichbar (${
                    err instanceof Error ? err.message : String(err)
                  }).`.slice(0, ERROR_MAX_CHARS),
                };
              }
              const result = await conn.serialize(() =>
                conn.client.callTool(t.name, (input ?? {}) as Record<string, unknown>, {
                  maxChars: RAW_RESULT_MAX_CHARS,
                })
              );
              // Error content is capped too: this object is persisted + streamed
              // verbatim, and a server-reported error can echo a huge payload.
              if (!result.ok) {
                return {
                  error: result.content.slice(0, ERROR_MAX_CHARS) || 'Fehler beim Tool-Aufruf.',
                };
              }
              const shaped = postProcess(source, t.name, result.content, params);
              // Managed-only widget detection: attach a lightweight pointer when
              // the tool ships an MCP-Apps / OpenAI-Apps-SDK `ui://` widget. This
              // file is first-party connectors only, so producing a pointer here
              // IS the trust gate — user connectors (mcpCatalog) never get one.
              const widgetUri = resolveWidgetUri(t.meta, result.meta, result.resources);
              if (widgetUri) {
                const uiResource: SystemWidgetPointer = {
                  serverKey: source.key,
                  toolName: t.name,
                  uri: widgetUri,
                  ...(result.structuredContent
                    ? { structuredContent: result.structuredContent }
                    : {}),
                };
                shaped.uiResource = uiResource;
                log.info(
                  `[managedMcpCatalog] widget ${source.key}__${t.name} → ${widgetUri}${
                    result.structuredContent ? ' (+structuredContent)' : ''
                  }`
                );
              }
              return shaped;
            },
          });
        }
        if (toolEntries.length > 0) {
          catalogByServer.set(source.key, `${source.name} · ${toolEntries.join(' · ')}`);
        }
      } catch (err) {
        log.warn(
          `[managedMcpCatalog] source "${source.key}" unreachable: ${err instanceof Error ? err.message : err}`
        );
        await lazy.close();
      }
    })
  );

  const catalogSummary = sources
    .map((s) => catalogByServer.get(s.key))
    .filter((line): line is string => line != null)
    .join('\n');

  return {
    tools,
    labels,
    catalogSummary,
    scopedServerMissing: false,
    scopedServerUnreachable: false,
    systemSourceKeys: mountedKeys,
    promptHints: sources.filter((s) => mountedKeys.has(s.key)).map((s) => s.promptHint),
    /** Closes only what was actually opened — a mount without a call is a no-op. */
    close: async () => {
      await Promise.all(connections.map((c) => c.close()));
    },
  };
}

/**
 * Tool descriptors for a source, from cache when possible.
 *
 * The cache is what makes the lazy mount work: with a warm entry this returns
 * without touching the network, so the whole catalog is built without a single
 * handshake. A cold entry has to connect — there is nothing to build a tool from
 * otherwise — and hands that open client to the lazy holder so the first actual
 * call reuses it instead of opening a second one.
 */
async function listToolsCached(
  source: SystemMcpSource,
  lazy: LazyConnection
): Promise<McpToolDescriptor[]> {
  const cached = toolListCache.get(source.key);
  if (cached && Date.now() - cached.at < TOOL_LIST_TTL_MS) return cached.tools;
  const client = new UserMCPClient(toSystemConnectionConfig(source));
  await client.connect();
  const tools = await client.listTools();
  toolListCache.set(source.key, { at: Date.now(), tools });
  lazy.adopt(client);
  return tools;
}

/** Source-specific result shaping; falls back to the (capped) raw text. */
function postProcess(
  source: SystemMcpSource,
  toolName: string,
  content: string,
  ctx: { sse: SSEWriter; sourceRegistry: SourceRegistry }
): Record<string, unknown> {
  if (source.key === 'bahn' && BAHN_TIMETABLE_TOOLS.has(toolName)) {
    const payload = condenseBahnTimetable(content);
    if (payload) {
      ctx.sse.send('bahn', { bahn: payload });
      return { content: JSON.stringify(payload) };
    }
  }
  if (source.key === 'news') {
    const results = extractNewsResults(content);
    if (results.length > 0) {
      const numbered = ctx.sourceRegistry.register(results);
      // Numbered snippets first so the model cites [N] — the citation block
      // must NEVER be the part that gets cut, so the raw text fills only the
      // remaining model budget.
      const room = Math.max(0, MODEL_RESULT_MAX_CHARS - numbered.length);
      return { content: `${numbered}\n\n${content.slice(0, room)}` };
    }
  }
  return { content: content.slice(0, MODEL_RESULT_MAX_CHARS) };
}
