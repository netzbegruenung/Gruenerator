/**
 * Loads a user's connected MCP servers as agentic-loop tools.
 *
 * Each MCP tool becomes an AI-SDK `dynamicTool` the ONE streamText loop calls
 * directly (grounding + prose in a single pass). Connect scoped/enabled servers
 * in parallel (dead servers skipped, not fatal), namespace tools
 * `m<serverKey>__<tool>` (derived from mcp_servers.id → STABLE across turns so
 * cross-turn tool-call replay resolves), MAX_TOOLS cap, snapshot refresh, and
 * the scoped-server-missing honesty signal.
 *
 * Connections are opened ONCE here and kept alive for the whole turn (a
 * streamText run may call the same tool across several steps — reconnecting per
 * call would pay the 15s handshake + SSRF revalidation each time); the caller
 * MUST invoke `close()` in a finally. Calls on a single client are serialized
 * (one MCP session = one JSON-RPC transport) since a step may issue parallel
 * tool calls.
 */
import { dynamicTool, jsonSchema, type JSONSchema7, type ToolSet } from 'ai';

import { McpServerRegistry } from '../../../services/mcp/McpServerRegistry.js';
import { describeDrift, evaluateToolDrift } from '../../../services/mcp/mcpToolDrift.js';
import { UserMCPClient } from '../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../utils/logger.js';
import { type McpToolResult, type ToolLabel } from '../services/agenticLoop/types.js';

import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';

const log = createLogger('mcpCatalog');

const MAX_TOOLS = 60;

/** Anthropic/tool-name regex is ^[a-zA-Z0-9_-]{1,64}$. Shared with systemMcpCatalog. */
export function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/** Required-param names of a sanitized MCP schema (drops non-string entries). */
export function requiredParams(schema: JSONSchema7): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((r): r is string => typeof r === 'string')
    : [];
}

/** Planner catalog annotation: "(keine Pflichtfelder)" or "(benötigt: a|b)". */
export function requiredParamsAnnotation(required: string[]): string {
  return required.length === 0 ? '(keine Pflichtfelder)' : `(benötigt: ${required.join('|')})`;
}

/** Per-client mutex: serialize callTool on one MCP session (no p-limit dep). */
export function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn) as Promise<T>;
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

export interface McpCatalog {
  /** dynamicTool per namespaced MCP tool, to merge into the loop catalog. */
  tools: ToolSet;
  /** namespaced name → display label ("Server · tool") for wrapTools titleFor. */
  labels: Map<string, ToolLabel>;
  /** Per-turn planner catalog: one line per connected server listing each tool
   *  and its required params, so the planner can survey siblings (e.g. a
   *  param-free "letzte/liste" tool) instead of giving up on a missing param. */
  catalogSummary: string;
  /** True when a scope was requested but the server is gone/disabled — the
   *  caller should answer honestly instead of running a tool-less loop. */
  scopedServerMissing: boolean;
  /** True when a scoped server was CONFIGURED but its connect/listTools failed
   *  (or it exposed no usable tools) — distinct from `scopedServerMissing`
   *  (deleted/disabled). Lets the caller say "gerade nicht erreichbar" instead
   *  of a generic no-answer. */
  scopedServerUnreachable: boolean;
  /** System catalogs only: keys of the sources that actually CONNECTED this
   *  turn (env-configured but unreachable sources are absent) — the prompt
   *  hints must be keyed to this, not to the env config. */
  systemSourceKeys?: ReadonlySet<string>;
  /** Managed catalogs only: the `promptHint` of every source that actually
   *  MOUNTED this turn, in mount order. Keyed to the mount and not to the env
   *  config for the same reason `systemSourceKeys` is — a configured but
   *  unreachable source must not have its usage instructions in the prompt.
   *  `{{TODAY_*}}` / `{{COUNTRY}}` placeholders are resolved by the caller. */
  promptHints?: string[];
  /** German explanations for servers whose tools were WITHHELD because their
   *  definitions drifted since the user approved them (rug pull). Non-empty
   *  means the turn ran with fewer tools than the user expects — say so rather
   *  than letting the server look broken or idle. */
  driftedServers?: string[];
  /** Close all opened connections. MUST be awaited in the caller's finally. */
  close: () => Promise<void>;
}

const EMPTY: McpCatalog = {
  tools: {},
  labels: new Map(),
  catalogSummary: '',
  scopedServerMissing: false,
  scopedServerUnreachable: false,
  driftedServers: [],
  close: async () => {},
};

export async function loadMcpCatalog(params: {
  userId: string;
  /** mcp:<serverId> scope from an @<server> mention, else null for all servers. */
  scope: string | null;
}): Promise<McpCatalog> {
  const { userId, scope } = params;

  let configs;
  try {
    configs = await McpServerRegistry.getConnectionConfigs(
      userId,
      scope ? { serverId: scope } : undefined
    );
  } catch (err) {
    log.warn(`[mcpCatalog] failed to load configs: ${err instanceof Error ? err.message : err}`);
    return EMPTY;
  }

  if (configs.length === 0) {
    // Scoped mention for a server the user disabled/deleted: signal honesty.
    return { ...EMPTY, scopedServerMissing: scope != null };
  }

  const clients: UserMCPClient[] = [];
  const tools: ToolSet = {};
  const labels = new Map<string, ToolLabel>();
  const seen = new Set<string>();
  // Keyed by config.id so the summary is emitted in stable configs order below
  // (Promise.all resolves the servers in a nondeterministic order).
  const catalogByServer = new Map<string, string>();
  // A scoped load has exactly one config; track whether it failed to mount so
  // the caller can report "gerade nicht erreichbar" instead of a silent miss.
  let anyUnreachable = false;
  // German explanations for servers whose tools were withheld because their
  // definitions drifted since approval. Surfaced, never swallowed: the user has
  // to know why a server they connected did nothing.
  const driftedServers: string[] = [];

  await Promise.all(
    configs.map(async (config) => {
      const client = new UserMCPClient(config);
      const mountStart = Date.now();
      try {
        await client.connect();
        const listed = await client.listTools();
        clients.push(client);
        // Mount timing was invisible: a slow-but-successful connect/listTools
        // (a laggy remote server) ran unbudgeted and looked like a hang with no
        // log. Surface duration + tool count per server.
        log.info(
          `[mcpCatalog] "${config.name}" mounted ${listed.length} tools in ${Date.now() - mountStart}ms`
        );
        if (listed.length === 0) {
          log.warn(`[mcpCatalog] "${config.name}" connected but exposed 0 tools`);
          anyUnreachable = true;
        }
        // A managed connector has no `mcp_servers` row: `config.id` is
        // `system-<key>`, not a UUID, so this write would fail at the column
        // cast rather than update nothing. The snapshot only feeds mention hints
        // and classifier context, and managed connectors get both from their env
        // definition instead.
        if (!config.managed) void McpServerRegistry.saveToolsSnapshot(userId, config.id, listed);
        const callSerialized = createSerializer();

        // Stable per (server, tool): derived from the server's mcp_servers.id
        // (not the per-turn index) so a tool name persisted this turn resolves to
        // the SAME catalog entry next turn — the invariant cross-turn replay needs.
        const serverKey = config.id.replace(/-/g, '').slice(0, 8);
        const toolEntries: string[] = [];
        // Built into a per-server set first so the drift check can reject the
        // WHOLE server before any of it becomes visible to the model. Merging
        // tool-by-tool as before would mean a rug-pulled description is already
        // in the catalog by the time we notice.
        const serverTools: ToolSet = {};
        const serverLabels = new Map<string, ToolLabel>();
        for (const t of listed) {
          if (Object.keys(serverTools).length >= MAX_TOOLS) break;
          const providerName = `m${serverKey}__${sanitizeToolName(t.name)}`.slice(0, 64);
          if (seen.has(providerName) || serverTools[providerName]) continue;
          serverLabels.set(providerName, {
            serverName: config.name,
            toolName: t.name,
            // Der Freigabe-Schlüssel hängt an der Server-ID, nicht am
            // Namensraum-Präfix: letzteres ist auf 8 Zeichen gekürzt.
            origin: {
              kind: config.managed ? 'managed' : 'mcp',
              serverId: config.id,
              remoteToolName: t.name,
              // Ungeprüft weitergereicht, auch für fremde Server: die
              // Vertrauensfrage beantwortet `approvalPolicy.ts` anhand von
              // `kind`, nicht diese Stelle.
              ...(t.readOnlyHint != null ? { readOnlyHint: t.readOnlyHint } : {}),
            },
          });

          const sanitized = sanitizeMcpSchema(t.inputSchema);
          const required = requiredParams(sanitized);
          toolEntries.push(`${t.name} ${requiredParamsAnnotation(required)}`);
          const requiredSuffix =
            required.length > 0 ? ` — Pflichtfelder: ${required.join(', ')}` : '';

          serverTools[providerName] = dynamicTool({
            description: `[${config.name}] ${t.description ?? ''}${requiredSuffix}`.slice(0, 1024),
            inputSchema: jsonSchema(sanitized),
            execute: async (input): Promise<McpToolResult> => {
              const result = await callSerialized(() =>
                client.callTool(t.name, (input ?? {}) as Record<string, unknown>)
              );
              // Error-as-result: the loop feeds this back so the model self-corrects.
              return result.ok
                ? { content: result.content }
                : { error: result.content || 'Fehler beim Tool-Aufruf.' };
            },
          });
        }

        // Rug-pull check: a server may rewrite a tool DESCRIPTION after the user
        // approved it, and a description is an instruction the model obeys.
        //
        // Skipped for MANAGED connectors, and not merely because the baseline has
        // nowhere to live (no row, non-UUID id): the check compares a server's
        // definitions against what the USER approved by connecting it. Nobody
        // connects a managed connector — we operate the server, and shipping a
        // changed tool description is our own deploy, not a third party's rug
        // pull. Running it here would block the connector on its first load and
        // re-baseline on every single turn.
        if (!config.managed) {
          const drift = await evaluateToolDrift(
            serverTools,
            config.approvedFingerprints,
            config.name
          );
          if (drift.blocked) {
            driftedServers.push(describeDrift(config.name, drift));
            return; // tools withheld; the connection is still closed via `clients`
          }
          if (drift.baselineEstablished) {
            void McpServerRegistry.saveToolFingerprints(userId, config.id, drift.current);
          }
        }

        for (const [providerName, def] of Object.entries(serverTools)) {
          if (Object.keys(tools).length >= MAX_TOOLS) break;
          if (seen.has(providerName)) continue;
          seen.add(providerName);
          tools[providerName] = def;
          const label = serverLabels.get(providerName);
          if (label) labels.set(providerName, label);
        }
        if (toolEntries.length > 0) {
          catalogByServer.set(config.id, `${config.name} · ${toolEntries.join(' · ')}`);
        }
      } catch (err) {
        log.warn(
          `[mcpCatalog] server "${config.name}" unreachable after ${Date.now() - mountStart}ms: ${err instanceof Error ? err.message : err}`
        );
        anyUnreachable = true;
        await client.close();
      }
    })
  );

  const catalogSummary = configs
    .map((c) => catalogByServer.get(c.id))
    .filter((line): line is string => line != null)
    .join('\n');

  return {
    tools,
    labels,
    catalogSummary,
    scopedServerMissing: false,
    // Scoped single-server load that produced no usable tools (connect/listTools
    // failed or the server exposed none) — honest signal, not a silent miss.
    scopedServerUnreachable: scope != null && labels.size === 0 && anyUnreachable,
    driftedServers,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()));
    },
  };
}
