/**
 * Chat Messages Controller
 * CRUD operations for chat messages
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';

import { withImageProxy } from './services/searchImagePayload.js';
import { canAccessThread } from './services/threadAccessService.js';
import { getUser } from './services/threadPersistenceService.js';

import type { WebImageResult } from '../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('MessagesController');
const router = createAuthenticatedRouter();

/**
 * Persisted image hits → render-ready payloads with a fresh proxy handle.
 *
 * Validates rather than casts: these rows were written by an older build in the
 * general case, and an entry without a usable URL would render as a tile with
 * `undefined` in its `src`.
 */
function rehydrateSearchImages(raw: unknown[]): unknown[] {
  const images: WebImageResult[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { url, title, domain } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || url.trim().length === 0) continue;
    images.push({
      url,
      title: typeof title === 'string' ? title : '',
      domain: typeof domain === 'string' ? domain : '',
    });
  }
  return images.map(withImageProxy);
}

router.get('/', async (req, res) => {
  try {
    const threadId = req.query.threadId as string;
    const user = getUser(req);

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const postgres = getPostgresInstance();

    if (!(await canAccessThread(ThreadId(threadId), UserId(user.id)))) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const messages = await postgres.query(
      `SELECT cm.id, cm.thread_id, cm.role, cm.content, cm.tool_calls, cm.tool_results, cm.user_id, cm.status, cm.created_at,
              p.display_name as sender_name
       FROM chat_messages cm
       LEFT JOIN profiles p ON cm.user_id = p.id
       WHERE cm.thread_id = $1
       ORDER BY cm.created_at ASC`,
      [threadId]
    );

    // Parse JSONB data if it comes back as string (some drivers do this).
    // A parse failure means corrupted data, not "field absent" — log it so it
    // doesn't masquerade as a message without tool calls.
    const parseJsonField = (data: unknown, fieldName: string, messageId: unknown): unknown => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch {
          log.warn(
            `Corrupted JSONB in chat_messages.${fieldName} (message ${String(messageId)}): ${data.slice(0, 100)}`
          );
          return null;
        }
      }
      return data;
    };

    // Debug: Log what we got from the database
    for (const msg of messages) {
      if (msg.tool_calls || msg.tool_results) {
        log.info(
          `[Load] Message ${msg.id}: tool_calls=${msg.tool_calls ? 'present' : 'null'}, tool_results=${msg.tool_results ? 'present' : 'null'}`
        );
        if (msg.tool_calls) {
          log.info(
            `[Load] tool_calls type: ${typeof msg.tool_calls}, isArray: ${Array.isArray(msg.tool_calls)}`
          );
        }
      }
    }

    // Build a map of toolCallId -> result for efficient lookup
    const buildResultsMap = (toolResults: unknown, messageId: unknown): Map<string, unknown> => {
      const map = new Map<string, unknown>();
      const parsed = parseJsonField(toolResults, 'tool_results', messageId);
      if (!Array.isArray(parsed)) return map;

      for (const tr of parsed) {
        if (tr && typeof tr === 'object' && 'toolCallId' in tr) {
          const toolResult = tr as { toolCallId: string; result?: unknown };
          map.set(toolResult.toolCallId, toolResult.result ?? toolResult);
        }
      }
      return map;
    };

    const formattedMessages = messages.map((msg) => {
      const parsedToolResults = parseJsonField(msg.tool_results, 'tool_results', msg.id);
      const parsedToolCalls = parseJsonField(msg.tool_calls, 'tool_calls', msg.id);
      const content = (msg.content as string) || '';

      // Extract metadata from tool_results if it's an object (not array)
      // tool_results can be either:
      // - Array: MCP tool invocation results [{toolCallId, result}, ...]
      // - Object: Search metadata {intent, searchCount, citations, searchResults, toolCalls?}
      let metadata:
        | {
            intent?: string;
            searchCount?: number;
            traceId?: string;
            citations?: unknown[];
            searchResults?: unknown[];
            searchImages?: unknown[];
            roleName?: string;
            generatedImage?: Record<string, unknown>;
            createdDocument?: Record<string, unknown>;
            computeData?: Record<string, unknown>;
            agentId?: string;
          }
        | undefined;
      let resultsMap = new Map<string, unknown>();
      // ChatGraph/SearchGraph persist toolCalls inline inside the metadata object
      // (with result already attached per entry). When present, this takes precedence
      // over the legacy tool_calls column + result-map reconstruction path.
      type EmbeddedToolCall = {
        toolCallId?: string;
        toolName?: string;
        args?: Record<string, unknown>;
        result?: unknown;
      };
      let embeddedToolCalls: EmbeddedToolCall[] | null = null;

      if (parsedToolResults && typeof parsedToolResults === 'object') {
        if (Array.isArray(parsedToolResults)) {
          // It's tool invocation results
          resultsMap = buildResultsMap(msg.tool_results, msg.id);
        } else {
          // It's search metadata or user message metadata (e.g. roleName)
          const meta = parsedToolResults as Record<string, unknown>;
          metadata = {
            ...(typeof meta.intent === 'string' && { intent: meta.intent }),
            ...(typeof meta.searchCount === 'number' && { searchCount: meta.searchCount }),
            ...(typeof meta.traceId === 'string' && { traceId: meta.traceId }),
            ...(Array.isArray(meta.citations) && { citations: meta.citations }),
            ...(Array.isArray(meta.searchResults) && { searchResults: meta.searchResults }),
            ...(typeof meta.roleName === 'string' && { roleName: meta.roleName }),
            ...(meta.generatedImage && typeof meta.generatedImage === 'object'
              ? { generatedImage: meta.generatedImage as Record<string, unknown> }
              : {}),
            ...(meta.createdDocument && typeof meta.createdDocument === 'object'
              ? { createdDocument: meta.createdDocument as Record<string, unknown> }
              : {}),
            ...(meta.computeData && typeof meta.computeData === 'object'
              ? { computeData: meta.computeData as Record<string, unknown> }
              : {}),
            ...(typeof meta.agentId === 'string' && { agentId: meta.agentId }),
            // Web-search image hits. Re-signed on every load rather than read
            // back verbatim: the persisted rows carry no `proxyUrl` (a signed
            // handle expires after 24h, the row does not), so the fresh handle
            // is minted here — the same "sign at the moment of handing out"
            // rule the live stream follows. With no signing secret configured
            // `withImageProxy` returns the entry unchanged and the client falls
            // back to plain links.
            ...(Array.isArray(meta.searchImages)
              ? { searchImages: rehydrateSearchImages(meta.searchImages) }
              : {}),
          };
          if (Array.isArray(meta.toolCalls)) {
            embeddedToolCalls = meta.toolCalls as EmbeddedToolCall[];
          }
        }
      }

      // Build tool invocations array. Prefer embedded toolCalls from the metadata
      // object (inline {toolCallId, toolName, args, result}); fall back to the
      // legacy split-column path (tool_calls + tool_results-as-array).
      const toolInvocations = embeddedToolCalls
        ? embeddedToolCalls.map((tc, index) => {
            const callId = tc.toolCallId || `tool-${index}`;
            return {
              toolCallId: callId,
              toolName: tc.toolName || 'unknown',
              args: tc.args || {},
              state: tc.result !== undefined ? 'result' : 'call',
              result: tc.result,
            };
          })
        : Array.isArray(parsedToolCalls)
          ? parsedToolCalls.map((tc: unknown, index: number) => {
              const toolCall = tc as {
                toolCallId?: string;
                toolName?: string;
                args?: Record<string, unknown>;
              };
              const callId = toolCall.toolCallId || `tool-${index}`;
              const result = resultsMap.get(callId);
              return {
                toolCallId: callId,
                toolName: toolCall.toolName || 'unknown',
                args: toolCall.args || {},
                state: result !== undefined ? 'result' : 'call',
                result: result,
              };
            })
          : undefined;

      // Build parts array for AI SDK v4.2+ compatibility
      // This ensures messages work with both legacy content field and new parts array
      const parts: Array<{ type: string; text?: string; toolInvocation?: unknown }> = [];

      // Add tool invocation parts first (they appear before text in the UI)
      if (toolInvocations) {
        for (const toolInvocation of toolInvocations) {
          parts.push({
            type: 'tool-invocation',
            toolInvocation,
          });
        }
      }

      // Add text part if content exists
      if (content) {
        parts.push({
          type: 'text',
          text: content,
        });
      }

      return {
        id: msg.id,
        role: msg.role,
        content,
        createdAt: msg.created_at,
        parts: parts.length > 0 ? parts : undefined,
        toolInvocations,
        metadata: {
          ...metadata,
          ...(embeddedToolCalls ? { toolCalls: embeddedToolCalls } : {}),
          ...(msg.user_id ? { senderId: msg.user_id, senderName: msg.sender_name || null } : {}),
          // A row still 'streaming' at read time is an aborted turn (the request
          // ended before finalize) — surface it so the frontend can mark the
          // partial reply as interrupted.
          ...(msg.status === 'streaming' ? { interrupted: true } : {}),
        },
      };
    });

    res.json(formattedMessages);
  } catch (error) {
    log.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const threadId = req.query.threadId as string;
    const user = getUser(req);

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const postgres = getPostgresInstance();

    const thread = await postgres.query('SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1', [
      threadId,
    ]);
    if ((thread as { user_id: string }[]).length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    if ((thread as { user_id: string }[])[0].user_id !== user.id) {
      return res.status(403).json({ error: 'Only thread owner can delete messages' });
    }

    await postgres.query(`DELETE FROM chat_messages WHERE thread_id = $1`, [threadId]);

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting messages:', error);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

export default router;
