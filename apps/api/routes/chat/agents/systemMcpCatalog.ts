/**
 * Mounts the first-party system MCP sources (Deutsche Bahn / Open-Meteo / ARD-
 * Tagesschau) as agentic-loop tools — the built-in counterpart to mcpCatalog's
 * per-user connectors. Fixed env configs (systemMcpServers.ts), no registry, no
 * snapshot writes; intent-scoped: a `bahn` turn mounts only the Bahn tools.
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
import {
  getSourcesForIntent,
  toSystemConnectionConfig,
  type SystemMcpKey,
  type SystemMcpSource,
} from '../../../services/mcp/systemMcpServers.js';
import { UserMCPClient, type McpToolDescriptor } from '../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import {
  createSerializer,
  requiredParams,
  requiredParamsAnnotation,
  sanitizeToolName,
  type McpCatalog,
} from './mcpCatalog.js';
import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';

const log = createLogger('systemMcpCatalog');

/** Oversized results are condensed here, not clipped mid-JSON by the client. */
const RAW_RESULT_MAX_CHARS = 400_000;
/**
 * Every value postProcess returns must stay UNDER the loop's model budget
 * (wrapTools truncateResultForModel, 6000 chars): once an object exceeds it,
 * deepTruncate slices each string LEAF to ~750 chars — which would shred the
 * bahn board mid-JSON and clip the news [N]-citation block. Staying below the
 * threshold means the model always sees the complete, untruncated result.
 */
const MODEL_RESULT_MAX_CHARS = 5_000;
const ERROR_MAX_CHARS = 2_000;
// ~15 entries ≈ 3-4k chars serialized — complete for the model AND more than
// the card renders (8 rows + "+N weitere").
const CONDENSED_MAX_ENTRIES = 15;
const NEWS_MAX_CITATIONS = 10;

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
      .slice(0, 400);
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
  close: async () => {},
};

/**
 * Load the system source(s) the turn's intent mounts as loop tools — one source
 * for `bahn`/`wetter`/`news`, the bahn+hotel+wetter trio for the `reise`
 * umbrella. Sources connect in parallel; an unreachable one is skipped (never
 * fatal — the loop then answers honestly / falls back to web search).
 */
export async function loadSystemMcpCatalog(params: {
  intent: string;
  sse: SSEWriter;
  sourceRegistry: SourceRegistry;
}): Promise<McpCatalog> {
  const sources = getSourcesForIntent(params.intent);
  if (sources.length === 0) return EMPTY;

  const clients: UserMCPClient[] = [];
  const tools: ToolSet = {};
  const labels = new Map<string, { serverName: string; toolName: string }>();
  const mountedKeys = new Set<string>();
  // Keyed by source.key for stable ordering (Promise.all resolves out of order).
  const catalogByServer = new Map<string, string>();

  await Promise.all(
    sources.map(async (source) => {
      const client = new UserMCPClient(toSystemConnectionConfig(source));
      try {
        await client.connect();
        const listed = await listToolsCached(source, client);
        clients.push(client);
        mountedKeys.add(source.key);
        const allowed = source.toolAllowlist
          ? listed.filter((t) => source.toolAllowlist?.includes(t.name))
          : listed;
        const callSerialized = createSerializer();

        const toolEntries: string[] = [];
        for (const t of allowed) {
          const providerName = `${source.key}__${sanitizeToolName(t.name)}`.slice(0, 64);
          if (tools[providerName]) continue;
          labels.set(providerName, { serverName: source.name, toolName: t.name });
          const sanitized = sanitizeMcpSchema(t.inputSchema);
          const required = requiredParams(sanitized);
          toolEntries.push(`${t.name} ${requiredParamsAnnotation(required)}`);
          const requiredSuffix =
            required.length > 0 ? ` — Pflichtfelder: ${required.join(', ')}` : '';
          tools[providerName] = dynamicTool({
            description: `[${source.name}] ${t.description ?? ''}${requiredSuffix}`.slice(0, 1024),
            inputSchema: jsonSchema(sanitized),
            execute: async (input) => {
              const result = await callSerialized(() =>
                client.callTool(t.name, (input ?? {}) as Record<string, unknown>, {
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
              return postProcess(source, t.name, result.content, params);
            },
          });
        }
        if (toolEntries.length > 0) {
          catalogByServer.set(source.key, `${source.name} · ${toolEntries.join(' · ')}`);
        }
      } catch (err) {
        log.warn(
          `[systemMcpCatalog] source "${source.key}" unreachable: ${err instanceof Error ? err.message : err}`
        );
        await client.close();
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
    systemSourceKeys: mountedKeys,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()));
    },
  };
}

async function listToolsCached(
  source: SystemMcpSource,
  client: UserMCPClient
): Promise<McpToolDescriptor[]> {
  const cached = toolListCache.get(source.key);
  if (cached && Date.now() - cached.at < TOOL_LIST_TTL_MS) return cached.tools;
  const tools = await client.listTools();
  toolListCache.set(source.key, { at: Date.now(), tools });
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
