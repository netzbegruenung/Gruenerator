/**
 * Loads a user's connected MCP servers as agentic-loop tools.
 *
 * Replaces mcpToolNode's raw-blocks double-LLM: instead of running its own
 * worker-pool tool loop and flattening the output into a context string for a
 * second model, each MCP tool becomes an AI-SDK `dynamicTool` the ONE streamText
 * loop calls directly (grounding + prose in a single pass).
 *
 * Behaviour preserved from mcpToolNode: connect scoped/enabled servers in
 * parallel (dead servers skipped, not fatal), namespace tools `s<idx>__<tool>`
 * (index-based → guaranteed-unique, bounded length), MAX_TOOLS cap, snapshot
 * refresh, and the scoped-server-missing honesty signal.
 *
 * Connections are opened ONCE here and kept alive for the whole turn (a
 * streamText run may call the same tool across several steps — reconnecting per
 * call would pay the 15s handshake + SSRF revalidation each time); the caller
 * MUST invoke `close()` in a finally. Calls on a single client are serialized
 * (one MCP session = one JSON-RPC transport) since a step may issue parallel
 * tool calls.
 */
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';

import { McpServerRegistry } from '../../../services/mcp/McpServerRegistry.js';
import { UserMCPClient } from '../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../utils/logger.js';

import { sanitizeMcpSchema } from './mcpSchemaSanitizer.js';

const log = createLogger('mcpCatalog');

const MAX_TOOLS = 60;

/** Anthropic/tool-name regex is ^[a-zA-Z0-9_-]{1,64}$ — same as mcpToolNode. */
function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/** Per-client mutex: serialize callTool on one MCP session (no p-limit dep). */
function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
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
  labels: Map<string, { serverName: string; toolName: string }>;
  /** True when a scope was requested but the server is gone/disabled — the
   *  caller should answer honestly instead of running a tool-less loop. */
  scopedServerMissing: boolean;
  /** Close all opened connections. MUST be awaited in the caller's finally. */
  close: () => Promise<void>;
}

const EMPTY: McpCatalog = {
  tools: {},
  labels: new Map(),
  scopedServerMissing: false,
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
  const labels = new Map<string, { serverName: string; toolName: string }>();
  const seen = new Set<string>();

  await Promise.all(
    configs.map(async (config, serverIdx) => {
      const client = new UserMCPClient(config);
      try {
        await client.connect();
        const listed = await client.listTools();
        clients.push(client);
        void McpServerRegistry.saveToolsSnapshot(userId, config.id, listed);
        const callSerialized = createSerializer();

        for (const t of listed) {
          if (Object.keys(tools).length >= MAX_TOOLS) break;
          const providerName = `s${serverIdx}__${sanitizeToolName(t.name)}`.slice(0, 64);
          if (seen.has(providerName)) continue;
          seen.add(providerName);
          labels.set(providerName, { serverName: config.name, toolName: t.name });

          tools[providerName] = dynamicTool({
            description: `[${config.name}] ${t.description ?? ''}`.slice(0, 1024),
            inputSchema: jsonSchema(sanitizeMcpSchema(t.inputSchema)),
            execute: async (input) => {
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
      } catch (err) {
        log.warn(
          `[mcpCatalog] server "${config.name}" unreachable: ${err instanceof Error ? err.message : err}`
        );
        await client.close();
      }
    })
  );

  return {
    tools,
    labels,
    scopedServerMissing: false,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()));
    },
  };
}
