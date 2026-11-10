/**
 * Loads a user's connected MCP servers as agentic-loop tools.
 *
 * Each MCP tool becomes an AI-SDK `dynamicTool` the ONE streamText loop calls
 * directly (grounding + prose in a single pass). Connect scoped/enabled servers
 * in parallel (dead servers skipped, not fatal), namespace tools
 * `m<serverKey>__<tool>` (derived from mcp_servers.id → STABLE across turns so
 * cross-turn tool-call replay resolves), MAX_TOOLS cap, snapshot refresh, and
 * the scoped-server-missing honesty signal. Always one server: the turn's
 * scope (see McpServerRegistry.getConnectionConfigs).
 *
 * Connections are opened ONCE here and kept alive for the whole turn (a
 * streamText run may call the same tool across several steps — reconnecting per
 * call would pay the 15s handshake + SSRF revalidation each time); the caller
 * MUST invoke `close()` in a finally. Calls on a single client are serialized
 * (one MCP session = one JSON-RPC transport) since a step may issue parallel
 * tool calls.
 */
import { type McpToolGrant } from '@gruenerator/contracts';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';

import { connectRefreshingOnce } from '../../../services/mcp/connectRefreshingOnce.js';
import { McpServerRegistry } from '../../../services/mcp/McpServerRegistry.js';
import { getThreadGrant } from '../../../services/mcp/mcpThreadGrants.js';
import { describeDrift, evaluateToolDrift } from '../../../services/mcp/mcpToolDrift.js';
import { UserMCPClient } from '../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { loadDeniedForServer } from '../services/agenticLoop/toolApprovalRepo.js';
import { type McpToolResult, type ToolLabel } from '../services/agenticLoop/types.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { loadManagedMcpCatalog } from './managedMcpCatalog.js';
import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';
import {
  createSerializer,
  requiredParams,
  requiredParamsAnnotation,
  sanitizeToolName,
} from './mcpToolHelpers.js';

const log = createLogger('mcpCatalog');

/**
 * Tools mounted from the ONE server a turn addresses. The bound is the 128-tool
 * request limit of OpenAI-compatible backends minus the loop's own catalog:
 * 21 tools without session extras (counted 03.10.2026), plus the creation
 * tools, loaders, `rezept_laden` and `ask_human` a session can add — 80 leaves
 * room for ~45. It used to be 60 and shared with every managed connector that
 * rode along, so a mentioned server got whatever was left after the fastest
 * connections — Typeform (64 tools) lost all of its form tools.
 */
const MAX_TOOLS = 80;

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
  /** Drifted tools still waiting for a decision in THIS thread (raw names) —
   *  the chat renders one grant card per server from these. A server whose
   *  `changed` list is non-empty was withheld entirely; `added` tools only. */
  toolGrants?: McpToolGrant[];
  /** The `mcp_servers` row the scope resolved to — what a sticky thread scope
   *  stores, so a legacy `system-<key>` alias is written back as the row id.
   *  Absent when nothing resolved. */
  resolvedServerId?: string | null;
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
  toolGrants: [],
  close: async () => {},
};

/**
 * The ONE way a turn mounts a connector. The scope resolves to the person's row
 * (a legacy `system-<key>` alias included); a known connector's row — Bahn,
 * Wetter, Rateo, … — is handed to `loadManagedMcpCatalog`, which carries what
 * is specific to the server behind the key. Everything below handles servers
 * the person added themselves.
 */
export async function loadMcpCatalog(params: {
  userId: string;
  /** mcp:<serverId> scope from an @<server> mention, a named server or the
   *  thread's sticky server. */
  scope: string;
  /** Enables „Nur dieses Gespräch" grants (mcpThreadGrants). */
  threadId?: string | null;
  /** Known connectors stream cards (Bahn) and register citations (tagesschau). */
  sse: SSEWriter;
  sourceRegistry: SourceRegistry;
}): Promise<McpCatalog> {
  const { userId, scope } = params;
  const threadId = params.threadId ?? null;

  let configs;
  try {
    configs = await McpServerRegistry.getConnectionConfigs(userId, scope);
  } catch (err) {
    log.warn(`[mcpCatalog] failed to load configs: ${err instanceof Error ? err.message : err}`);
    return EMPTY;
  }

  if (configs.length === 0) {
    // Scoped mention for a server the user disabled/deleted: signal honesty.
    return { ...EMPTY, scopedServerMissing: true };
  }

  const known = configs.find((c) => c.registryKey != null);
  if (known) {
    return loadManagedMcpCatalog({
      config: known,
      sse: params.sse,
      sourceRegistry: params.sourceRegistry,
    });
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
  const toolGrants: McpToolGrant[] = [];

  await Promise.all(
    configs.map(async (config) => {
      let client = new UserMCPClient(config);
      const mountStart = Date.now();
      try {
        client = await connectRefreshingOnce(userId, client, config);
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
        void McpServerRegistry.saveToolsSnapshot(userId, config.id, listed);
        const callSerialized = createSerializer();

        // Stable per (server, tool): derived from the server's mcp_servers.id
        // (not the per-turn index) so a tool name persisted this turn resolves to
        // the SAME catalog entry next turn — the invariant cross-turn replay needs.
        const serverKey = config.id.replace(/-/g, '').slice(0, 8);
        // Keyed by provider name so withheld tools drop out of the summary too.
        const toolEntries = new Map<string, string>();
        // Built into a per-server set first so the drift check can reject the
        // WHOLE server before any of it becomes visible to the model. Merging
        // tool-by-tool as before would mean a rug-pulled description is already
        // in the catalog by the time we notice.
        const serverTools: ToolSet = {};
        const serverLabels = new Map<string, ToolLabel>();
        if (listed.length > MAX_TOOLS) {
          // Never silent: the person connected this server for these tools.
          log.warn(
            `[mcpCatalog] "${config.name}" exposes ${listed.length} tools, mounting ${MAX_TOOLS} — dropped: ${listed
              .slice(MAX_TOOLS)
              .map((t) => t.name)
              .join(', ')}`
          );
        }
        for (const t of listed.slice(0, MAX_TOOLS)) {
          const providerName = `m${serverKey}__${sanitizeToolName(t.name)}`.slice(0, 64);
          if (seen.has(providerName) || serverTools[providerName]) {
            log.warn(
              `[mcpCatalog] "${config.name}" tool "${t.name}" dropped: name collides after truncation (${providerName})`
            );
            continue;
          }
          serverLabels.set(providerName, {
            serverName: config.name,
            toolName: t.name,
            // Der Freigabe-Schlüssel hängt an der Server-ID, nicht am
            // Namensraum-Präfix: letzteres ist auf 8 Zeichen gekürzt.
            origin: {
              kind: 'mcp',
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
          toolEntries.set(providerName, `${t.name} ${requiredParamsAnnotation(required)}`);
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
        // Never reached by a known connector (handed off above): we operate or
        // vetted that server, and its next deploy shipping a changed tool
        // description is not a third party's rug pull.
        //
        // Skipped for CURATED directory entries (McpRegistryService seed) for
        // the same reason: we vetted that vendor before listing it, and its
        // next release shipping new tools is not a third party's rug pull. The
        // check is for servers the user typed in themselves.
        if (!config.curated) {
          const drift = await evaluateToolDrift(
            serverTools,
            config.approvedFingerprints,
            config.name
          );
          const toolName = (p: string) => serverLabels.get(p)?.toolName ?? p;
          if (drift.changed.length > 0 || drift.added.length > 0) {
            // Persisted so the settings can show what changed and offer the
            // approval the chat message points to. The digests let a grant
            // for one conversation pin exactly these definitions.
            const fingerprints: Record<string, string> = {};
            for (const p of [...drift.changed, ...drift.added]) {
              const digest = drift.current[p];
              if (digest) fingerprints[toolName(p)] = digest;
            }
            void McpServerRegistry.saveToolsDrift(userId, config.id, {
              changed: drift.changed.map(toolName),
              added: drift.added.map(toolName),
              fingerprints,
            });
          }
          // „Nur dieses Gespräch": a drifted tool granted in this thread is
          // mounted while its definition still matches what was granted.
          const threadGrant =
            threadId && (drift.changed.length > 0 || drift.added.length > 0)
              ? await getThreadGrant(threadId, config.id)
              : {};
          const ungranted = (p: string) => threadGrant[toolName(p)] !== drift.current[p];
          const changed = drift.changed.filter(ungranted);
          const added = drift.added.filter(ungranted);
          if (changed.length > 0 || added.length > 0) {
            toolGrants.push({
              serverId: config.id,
              serverName: config.name,
              added: added.map(toolName),
              changed: changed.map(toolName),
              threadId,
            });
          }
          if (changed.length > 0) {
            driftedServers.push(describeDrift(config.name, changed.map(toolName)));
            return; // tools withheld; the connection is still closed via `clients`
          }
          // New tools wait for approval; the approved ones keep working.
          for (const p of added) delete serverTools[p];
          if (drift.baselineEstablished) {
            void McpServerRegistry.saveToolFingerprints(userId, config.id, drift.current);
          }
        }

        // Tools the person switched OFF stay out of the catalog entirely, not
        // just out of reach: a tool description is an instruction the model
        // reads every turn. Filtered AFTER the drift check so the fingerprints
        // keep covering the server's whole tool set.
        const denied = await loadDeniedForServer(userId, config.id);
        if (denied.size > 0) {
          for (const [providerName, label] of serverLabels) {
            if (denied.has(label.toolName)) delete serverTools[providerName];
          }
        }

        for (const [providerName, def] of Object.entries(serverTools)) {
          if (seen.has(providerName)) continue;
          seen.add(providerName);
          tools[providerName] = def;
          const label = serverLabels.get(providerName);
          if (label) labels.set(providerName, label);
        }
        const mounted = [...toolEntries]
          .filter(([providerName]) => serverTools[providerName])
          .map(([, entry]) => entry);
        if (mounted.length > 0) {
          catalogByServer.set(config.id, `${config.name} · ${mounted.join(' · ')}`);
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
    scopedServerUnreachable: labels.size === 0 && anyUnreachable,
    driftedServers,
    toolGrants,
    resolvedServerId: configs[0]?.id ?? null,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()));
    },
  };
}
