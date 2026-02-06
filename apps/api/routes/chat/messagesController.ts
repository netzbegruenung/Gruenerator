/**
 * Chat Messages Controller
 * CRUD operations for chat messages
 */

import express from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Thread, Message } from './agents/types.js';

const log = createLogger('MessagesController');
const router = createAuthenticatedRouter();

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

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

    const threads = await postgres.query<Thread>(
      `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (threads[0].user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const messages = await postgres.query<Message>(
      `SELECT id, thread_id, role, content, tool_calls, tool_results, created_at
       FROM chat_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    );

    // Parse JSONB data if it comes back as string (some drivers do this)
    const parseJsonField = (data: unknown): unknown => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      }
      return data;
    };

    // Debug: Log what we got from the database
    for (const msg of messages) {
      if (msg.tool_calls || msg.tool_results) {
        log.info(`[Load] Message ${msg.id}: tool_calls=${msg.tool_calls ? 'present' : 'null'}, tool_results=${msg.tool_results ? 'present' : 'null'}`);
        if (msg.tool_calls) {
          log.info(`[Load] tool_calls type: ${typeof msg.tool_calls}, isArray: ${Array.isArray(msg.tool_calls)}`);
        }
      }
    }

    // Build a map of toolCallId -> result for efficient lookup
    const buildResultsMap = (toolResults: unknown): Map<string, unknown> => {
      const map = new Map<string, unknown>();
      const parsed = parseJsonField(toolResults);
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
      const resultsMap = buildResultsMap(msg.tool_results);
      const parsedToolCalls = parseJsonField(msg.tool_calls);
      const content = msg.content || '';

      // Build tool invocations array
      const toolInvocations = Array.isArray(parsedToolCalls)
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

    const threads = await postgres.query<Thread>(
      `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (threads[0].user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await postgres.query(`DELETE FROM chat_messages WHERE thread_id = $1`, [threadId]);

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting messages:', error);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

export default router;
