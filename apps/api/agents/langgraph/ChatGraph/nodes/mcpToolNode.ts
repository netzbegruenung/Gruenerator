/**
 * MCP Tool Node (EXPERIMENTAL — `mcp` intent)
 *
 * Runs a bounded tool-calling loop against the user's connected external MCP
 * servers. Unlike the rest of the graph (one-shot service calls keyed off an
 * intent), this node grafts a genuine provider tool-use loop into a single node,
 * mirroring the proven skeleton in routes/texte/gruenerator_ask.ts:
 *   assistant = raw_content_blocks → user = tool_result → loop while tool_use.
 *
 * The aggregated tool output + the loop's final text are returned as
 * `mcpToolContext`, which respondNode injects as authoritative context so the
 * final answer streams through the normal text_delta path.
 *
 * Robustness: the node NEVER throws out. A missing userId, no servers, dead
 * servers, timeouts, or a tool that errors all degrade to a partial/empty
 * context so the turn falls back to a normal `direct` answer. Tokens for
 * untrusted servers are held encrypted in McpServerRegistry; per-call timeouts
 * and a round cap bound the loop.
 */

import { McpServerRegistry } from '../../../../services/mcp/McpServerRegistry.js';
import { UserMCPClient } from '../../../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../../../utils/logger.js';
import { type Tool } from '../../../../workers/types.js';

import { extractMessageText, formatConversationHistory } from './classifierHeuristics.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:Mcp');

const MAX_ROUNDS = 5;
const MAX_TOOLS = 60;
/** Total wall-clock budget for the whole loop (connect + list + rounds). */
const LOOP_BUDGET_MS = 90_000;

interface RoutedTool {
  client: UserMCPClient;
  /** Original tool name on the server (before namespacing). */
  toolName: string;
  serverName: string;
}

/** Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$. */
function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/** When a scoped @mention/prose hit names a server that's gone, tell the user. */
const SCOPED_SERVER_MISSING =
  '## Hinweis\nDer erwähnte Dienst ist nicht (mehr) verbunden oder wurde deaktiviert. Weise den Nutzer freundlich darauf hin, dass er die Verbindung unter Einstellungen → Verbindungen (wieder) aktivieren kann.';

export async function mcpToolNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const userId = state.agentConfig.userId;
  if (!userId) return { mcpToolContext: null, mcpToolTimeMs: 0 };

  const scope = state.mcpServerScope ?? null;

  let configs;
  try {
    configs = await McpServerRegistry.getConnectionConfigs(
      userId,
      scope ? { serverId: scope } : undefined
    );
  } catch (err) {
    log.warn('[Mcp] Failed to load server configs', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { mcpToolContext: null, mcpToolTimeMs: Date.now() - startTime };
  }
  if (configs.length === 0) {
    // A scoped mention/prose hit for a server the user disabled or deleted:
    // answer honestly instead of silently degrading to a hallucinated reply.
    if (scope) {
      log.info('[Mcp] Scoped server not connected/enabled', { scope });
      return { mcpToolContext: SCOPED_SERVER_MISSING, mcpToolTimeMs: Date.now() - startTime };
    }
    return { mcpToolContext: null, mcpToolTimeMs: 0 };
  }

  const clients: UserMCPClient[] = [];
  const catalog: Tool[] = [];
  const routes = new Map<string, RoutedTool>();

  try {
    // Connect + listTools in parallel; a dead server is skipped, not fatal.
    // Namespacing uses a stable per-server index (`s<idx>__tool`) rather than a
    // sanitized display name: this guarantees cross-server uniqueness and a
    // bounded length regardless of what the user named the server (OpenWebUI's
    // name-based `_` scheme is collision-prone when ids contain the delimiter).
    await Promise.all(
      configs.map(async (config, serverIdx) => {
        const client = new UserMCPClient(config);
        try {
          await client.connect();
          const tools = await client.listTools();
          clients.push(client);
          // Refresh the cached snapshot used by the mention picker + classifier.
          void McpServerRegistry.saveToolsSnapshot(userId, config.id, tools);
          for (const tool of tools) {
            if (catalog.length >= MAX_TOOLS) break;
            const providerName = `s${serverIdx}__${sanitizeToolName(tool.name)}`.slice(0, 64);
            if (routes.has(providerName)) continue;
            routes.set(providerName, {
              client,
              toolName: tool.name,
              serverName: config.name,
            });
            catalog.push({
              name: providerName,
              description: `[${config.name}] ${tool.description}`.slice(0, 1024),
              input_schema: tool.inputSchema,
            });
          }
        } catch (err) {
          log.warn('[Mcp] Server unreachable, skipping', {
            server: config.name,
            error: err instanceof Error ? err.message : String(err),
          });
          await client.close();
        }
      })
    );

    if (catalog.length === 0) {
      log.info('[Mcp] No tools available from connected servers');
      return { mcpToolContext: null, mcpToolTimeMs: Date.now() - startTime };
    }

    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    const rawUserText = extractMessageText(lastUserMessage?.content);
    const conversationContext = formatConversationHistory(state.messages);
    const userContent = conversationContext
      ? `${conversationContext}\n\nAktuelle Anfrage: "${rawUserText}"`
      : `Anfrage: "${rawUserText}"`;

    // Scoped runs name the single service so the model stays on-task and doesn't
    // apologize for "missing" tools that live on a server we deliberately excluded.
    const scopedServerName = scope ? configs[0]?.name : null;
    const toolSourceLine = scopedServerName
      ? `Du arbeitest ausschließlich mit den Tools des Dienstes „${scopedServerName}", den der Nutzer verbunden hat (via MCP-Server).`
      : 'Du bist ein Assistent mit Zugriff auf externe Tools, die der Nutzer verbunden hat (via MCP-Server).';
    const systemPrompt = `${toolSourceLine}
Nutze die passenden Tools, um die Anfrage zu erfüllen. Du kannst mehrere Tools nacheinander aufrufen.
Wenn kein Tool passt oder die verfügbaren Tools die Anfrage nicht erfüllen können, sage das klar und rufe kein Tool auf.
Fasse am Ende die Ergebnisse knapp auf Deutsch zusammen.`;

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | unknown[] }> =
      [{ role: 'user', content: userContent }];

    const toolOutputs: string[] = [];
    let finalText = '';
    let round = 0;
    // Set when the loop stops while the model still wanted to call tools, so the
    // responder can tell the user the run was cut short rather than silently
    // returning partial results (a UX touch borrowed from OpenWebUI).
    let limitReached = false;

    while (round < MAX_ROUNDS) {
      if (Date.now() - startTime > LOOP_BUDGET_MS) {
        log.warn('[Mcp] Loop budget exceeded, stopping');
        limitReached = true;
        break;
      }
      round++;

      const aiResult = await state.aiWorkerPool.processRequest(
        {
          type: 'mcp_tool_loop',
          // Mistral Medium 3.5 is our strongest tool-calling model; route
          // explicitly (the mistralAdapter passes tools + returns tool_use).
          provider: 'mistral',
          systemPrompt,
          messages,
          options: {
            model: 'mistral-medium-2604',
            max_tokens: 2000,
            tools: catalog,
          },
        },
        null
      );

      if (!aiResult.success) {
        log.warn('[Mcp] AI request failed', { error: aiResult.error });
        break;
      }

      if (aiResult.raw_content_blocks) {
        messages.push({ role: 'assistant', content: aiResult.raw_content_blocks });
      }
      if (aiResult.content) finalText = aiResult.content;

      if (
        aiResult.stop_reason === 'tool_use' &&
        aiResult.tool_calls &&
        aiResult.tool_calls.length > 0
      ) {
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> =
          [];
        for (const call of aiResult.tool_calls) {
          const route = routes.get(call.name);
          if (!route) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: `Unbekanntes Tool: ${call.name}`,
            });
            continue;
          }
          state.onMcpProgress?.({ phase: 'start', server: route.serverName, tool: route.toolName });
          const result = await route.client.callTool(route.toolName, call.input);
          state.onMcpProgress?.({
            phase: 'result',
            server: route.serverName,
            tool: route.toolName,
            ok: result.ok,
          });
          toolOutputs.push(`### ${route.serverName} · ${route.toolName}\n${result.content}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: result.content || (result.ok ? '(kein Inhalt)' : 'Fehler'),
          });
        }
        messages.push({ role: 'user', content: toolResults });
        if (round >= MAX_ROUNDS) {
          // Model still wants tools but we're out of rounds — stop and flag it.
          limitReached = true;
          break;
        }
        continue;
      }

      // No more tool calls — the model produced its final answer.
      break;
    }

    const timeMs = Date.now() - startTime;
    if (toolOutputs.length === 0 && !finalText) {
      log.info(`[Mcp] Loop produced no output in ${timeMs}ms`);
      return { mcpToolContext: null, mcpToolTimeMs: timeMs };
    }

    const context = [
      toolOutputs.length ? `## Tool-Aufrufe\n\n${toolOutputs.join('\n\n')}` : '',
      finalText ? `## Zusammenfassung der Tools\n\n${finalText}` : '',
      limitReached
        ? '## Hinweis\nDas Tool-Limit wurde erreicht, bevor alle Schritte abgeschlossen waren. Weise den Nutzer darauf hin, dass das Ergebnis unvollständig sein kann.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    log.info(
      `[Mcp] ${routes.size} tools, ${round} rounds, ${toolOutputs.length} calls in ${timeMs}ms`
    );
    return { mcpToolContext: context, mcpToolTimeMs: timeMs };
  } catch (error) {
    log.error(`[Mcp] Error: ${error instanceof Error ? error.message : String(error)}`);
    return { mcpToolContext: null, mcpToolTimeMs: Date.now() - startTime };
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
}
