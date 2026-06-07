/**
 * Chat Streaming Controller
 * Handles AI chat streaming via Vercel AI SDK
 */

import { streamText, type ModelMessage, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { generateThreadTitle } from '../../services/chat/threadTitleService.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { getDefaultAgentId, getAgentOrCustomPrompt } from './agents/agentLoader.js';
import { getModel, isProviderConfigured } from './agents/providers.js';
import { createSearchTools } from './agents/searchTools.js';
import {
  getCompactionState,
  prepareMessagesWithCompaction,
  type CompactionState,
} from './services/compactionService.js';
import { getUser } from './services/threadPersistenceService.js';

const log = createLogger('ChatStreamController');
const router = createAuthenticatedRouter();

// DISABLED: 'person' - not production ready
type ToolKey = 'search' | 'web' | 'examples' | 'pressemitteilung_examples' | 'research' | 'direct';

type SearchToolName =
  | 'gruenerator_search'
  // | 'gruenerator_person_search' // DISABLED: Person search not production ready
  | 'gruenerator_examples_search'
  | 'gruenerator_pressemitteilung_examples'
  | 'web_search'
  | 'research'
  | 'direct_response';

const TOOL_KEY_TO_NAME: Record<ToolKey, SearchToolName> = {
  search: 'gruenerator_search',
  web: 'web_search',
  // person: 'gruenerator_person_search', // DISABLED: Person search not production ready
  examples: 'gruenerator_examples_search',
  pressemitteilung_examples: 'gruenerator_pressemitteilung_examples',
  research: 'research',
  direct: 'direct_response',
};

const SEARCH_TOOL_DESCRIPTIONS: Record<Exclude<SearchToolName, 'direct_response'>, string> = {
  research:
    '**research** - Komplexe Fragen, explizite Recherche-Anfragen ("recherchiere", "suche nach", "finde heraus")',
  gruenerator_search: '**gruenerator_search** - Grüne Programme, Positionen, Beschlüsse',
  web_search:
    '**web_search** - Aktuelle Nachrichten, externe Fakten, Personen-Infos ("Wer ist...")',
  gruenerator_examples_search:
    '**gruenerator_examples_search** - Social-Media-Vorlagen und Beispiel-Posts (Facebook, Instagram, Twitter, LinkedIn, TikTok)',
  gruenerator_pressemitteilung_examples:
    '**gruenerator_pressemitteilung_examples** - Echte Pressemitteilungen aus Landesverbänden als Vorlage für Aufbau, Lead, Zitat-Setzung und Tonalität',
};

function buildToolUsageSection(availableTools: ToolSet, agentSystemRole: string): string {
  const present = Object.keys(availableTools) as SearchToolName[];
  const searchTools = present.filter(
    (n): n is Exclude<SearchToolName, 'direct_response'> => n !== 'direct_response'
  );
  const hasDirect = present.includes('direct_response');
  const hasExplicitSteps = /Nutze IMMER/i.test(agentSystemRole);

  if (searchTools.length === 0 && !hasDirect) return '';

  const lines: string[] = ['## TOOL-NUTZUNG', ''];

  if (hasExplicitSteps) {
    lines.push(
      'Wenn dein systemRole oben einen Schritt mit „Nutze IMMER X" nennt, hat dieser Schritt Vorrang vor der ENTSCHEIDUNGSLOGIK unten — auch bei kreativen Aufgaben (Pressemitteilungen, Social-Media-Posts, Reden, Anträge).',
      ''
    );
  }

  lines.push(
    'Du MUSST für jede Nachricht ein Tool wählen. Entscheide semantisch basierend auf dem Inhalt:',
    ''
  );

  if (searchTools.length > 0) {
    lines.push('### SUCH-TOOLS (für Informationsbedarf und Inhalts-Generierung)');
    for (const t of searchTools) lines.push(`- ${SEARCH_TOOL_DESCRIPTIONS[t]}`);
    lines.push('');
  }

  if (hasDirect) {
    lines.push('### DIREKT-TOOL');
    lines.push(
      '- **direct_response** - NUR für reine Begrüßungen, Dankesnachrichten oder Rückfragen ohne neuen Inhaltsbedarf. NIEMALS für Pressemitteilungen, Social-Media-Posts, Reden, Anträge oder andere Inhalts-Generierung — diese benötigen IMMER zuerst ein Such-Tool.',
      ''
    );
  }

  lines.push('### ENTSCHEIDUNGSLOGIK');
  let step = 1;
  if (hasExplicitSteps) {
    lines.push(
      `${step++}. Nennt dein systemRole oben „Nutze IMMER X"? → Genau dieses Tool, ohne Ausnahme.`
    );
  }
  if (searchTools.length > 0) {
    lines.push(
      `${step++}. Soll Inhalt erstellt werden (PM, Post, Rede, Antrag)? → Such-Tool zuerst, um Beispiele/Fakten zu finden.`
    );
    lines.push(`${step++}. Fragt der Benutzer nach Fakten/Informationen? → Such-Tool.`);
    lines.push(`${step++}. Nennt der Benutzer ein spezifisches Tool? → Das genannte Tool.`);
  }
  if (hasDirect) {
    lines.push(`${step++}. Reine Begrüßung/Dank/Rückfrage ohne neuen Inhalt? → direct_response.`);
  }
  lines.push('');

  lines.push(
    '## ANTWORT-VERHALTEN',
    '',
    '1. **Fokus**: Beantworte NUR was gefragt wurde. Keine ungebetene Spekulation.',
    '2. **Kürze**: Kurze, präzise Antworten. Maximal 3-4 Absätze für einfache Fragen.',
    '3. **Zitieren**: Bei research-Tool Inline-Zitate [1], [2] in Antwort übernehmen.',
    '4. **Quellen**: Verwende NUR Inline-Verweise [1], [2] etc. Erstelle KEINE Quellenliste am Ende — die Quellen werden automatisch in der Oberfläche angezeigt.',
    '',
    'Im Zweifel lieber suchen als raten. Antworte auf Deutsch. Erfinde keine Fakten.'
  );

  return lines.join('\n');
}

const chatStreamRequestSchema = z.object({
  messages: z.array(z.unknown()),
  agentId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  threadId: z.string().optional(),
  enabledTools: z
    .record(
      z.enum(['search', 'web', 'examples', 'pressemitteilung_examples', 'research', 'direct']),
      z.boolean()
    )
    .optional(),
});
type ChatStreamRequestBody = z.infer<typeof chatStreamRequestSchema>;

async function createThread(
  userId: string,
  agentId: string,
  title?: string
): Promise<{ id: string; user_id: string; agent_id: string; title: string | null }> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  );
  return result[0] as { id: string; user_id: string; agent_id: string; title: string | null };
}

async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  toolCalls?: unknown,
  toolResults?: unknown
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_calls, tool_results)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      threadId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      toolResults ? JSON.stringify(toolResults) : null,
    ]
  );
}

async function touchThread(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    threadId,
  ]);
}

router.post(
  '/',
  validateBody(chatStreamRequestSchema),
  async (req: TypedRequest<ChatStreamRequestBody>, res) => {
    try {
      const { messages: rawMessages, agentId, provider, model, threadId, enabledTools } = req.body;
      const messages = rawMessages as ModelMessage[];

      log.info('[Chat Debug] === NEW REQUEST ===');
      log.info(`[Chat Debug] Request body:`, {
        messagesCount: messages?.length || 0,
        agentId,
        provider,
        model,
        threadId,
        enabledTools,
      });

      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        log.info(`[Chat Debug] Last message:`, {
          role: lastMsg.role,
          contentType: typeof lastMsg.content,
          contentLength:
            typeof lastMsg.content === 'string'
              ? lastMsg.content.length
              : JSON.stringify(lastMsg.content).length,
          contentPreview:
            typeof lastMsg.content === 'string'
              ? lastMsg.content.slice(0, 100)
              : JSON.stringify(lastMsg.content).slice(0, 100),
        });
      }

      const user = getUser(req);
      if (!user?.id) {
        log.warn('[Chat Debug] Unauthorized - no user');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const userId = user.id;
      log.info(`[Chat Debug] User: ${userId}`);

      const agent = await getAgentOrCustomPrompt(agentId || getDefaultAgentId(), userId);
      if (!agent) {
        log.warn(`[Chat Debug] Agent not found: ${agentId}`);
        return res.status(404).json({ error: 'Agent not found' });
      }
      log.info(`[Chat Debug] Agent loaded: ${agent.identifier}`);

      const effectiveProvider = provider || agent.provider;
      const effectiveModel = model || agent.model;
      log.info(`[Chat Debug] Provider: ${effectiveProvider}, Model: ${effectiveModel}`);

      const lastUserMessage = messages.filter((m: ModelMessage) => m.role === 'user').pop();

      let actualThreadId = threadId;
      let isNewThread = false;

      if (!actualThreadId && lastUserMessage) {
        const thread = await createThread(
          userId,
          agentId || getDefaultAgentId(),
          typeof lastUserMessage.content === 'string'
            ? lastUserMessage.content.slice(0, 50) +
                (lastUserMessage.content.length > 50 ? '...' : '')
            : 'Neue Unterhaltung'
        );
        actualThreadId = thread.id;
        isNewThread = true;
      }

      if (actualThreadId && lastUserMessage) {
        const content =
          typeof lastUserMessage.content === 'string'
            ? lastUserMessage.content
            : JSON.stringify(lastUserMessage.content);
        await createMessage(actualThreadId, 'user', content);
      }

      const hasTools = agent.plugins?.includes('gruenerator-mcp');
      const agentTools = createSearchTools(agent, { includeDirectResponse: true });

      const agentToolKeys: Set<ToolKey> | null = agent.enabledTools
        ? new Set(
            agent.enabledTools.filter((k): k is ToolKey =>
              Object.prototype.hasOwnProperty.call(TOOL_KEY_TO_NAME, k)
            )
          )
        : null;

      const filteredTools: ToolSet = {};
      if (hasTools && enabledTools) {
        for (const [key, toolName] of Object.entries(TOOL_KEY_TO_NAME)) {
          const allowedByRequest = enabledTools[key as ToolKey];
          const allowedByAgent = !agentToolKeys || agentToolKeys.has(key as ToolKey);
          if (
            toolName === 'direct_response' ||
            (allowedByRequest && allowedByAgent && agentTools[toolName])
          ) {
            filteredTools[toolName] = agentTools[toolName];
          }
        }
      } else if (hasTools) {
        for (const [key, toolName] of Object.entries(TOOL_KEY_TO_NAME)) {
          const allowedByAgent = !agentToolKeys || agentToolKeys.has(key as ToolKey);
          if ((toolName === 'direct_response' || allowedByAgent) && agentTools[toolName]) {
            filteredTools[toolName] = agentTools[toolName];
          }
        }
      }

      const toolUsageSection = buildToolUsageSection(filteredTools, agent.systemRole);
      const baseSystemMessage = toolUsageSection
        ? `${agent.systemRole}\n\n${toolUsageSection}`
        : agent.systemRole;

      // Load compaction state if thread exists
      let compactionState: CompactionState = {
        summary: null,
        compactedUpToMessageId: null,
        compactionUpdatedAt: null,
      };
      if (actualThreadId) {
        try {
          compactionState = await getCompactionState(actualThreadId);
          if (compactionState.summary) {
            log.info(
              `[Chat] Thread ${actualThreadId} has compaction summary (${compactionState.summary.length} chars)`
            );
          }
        } catch (error) {
          log.warn(`[Chat] Failed to load compaction state for thread ${actualThreadId}:`, error);
        }
      }

      // Apply compaction if available (prepends summary to system message, trims old messages)
      const { messages: preparedMessages, systemMessage } = prepareMessagesWithCompaction(
        messages,
        compactionState,
        baseSystemMessage
      );

      const aiMessages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...preparedMessages,
      ];

      if (!isProviderConfigured(effectiveProvider)) {
        log.error(`[Chat Debug] Provider not configured: ${effectiveProvider}`);
        return res.status(500).json({ error: `Provider "${effectiveProvider}" is not configured` });
      }
      log.info(`[Chat Debug] Provider configured: ${effectiveProvider}`);

      const aiModel = getModel(effectiveProvider, effectiveModel);
      log.info(`[Chat Debug] AI Model obtained: ${effectiveModel}`);

      log.info(
        `[Chat Debug] hasTools: ${hasTools}, agent.plugins: ${JSON.stringify(agent.plugins)}, agentEnabledTools: ${JSON.stringify(agent.enabledTools)}`
      );

      const activeTools = Object.keys(filteredTools).length > 0 ? filteredTools : undefined;

      // AI decides semantically which tool to use
      // direct_response tool is the escape hatch for non-search cases
      log.info(
        `[Chat Debug] Tool config: hasTools=${hasTools}, activeTools=${Object.keys(filteredTools)}, toolChoice=${activeTools ? 'required' : 'none'}`
      );
      log.info(`[Chat Debug] Calling streamText with:`, {
        model: effectiveModel,
        messagesCount: aiMessages.length,
        toolsCount: activeTools ? Object.keys(activeTools).length : 0,
        maxTokens: agent.params.max_tokens,
        temperature: agent.params.temperature,
      });

      let result;
      try {
        result = streamText({
          model: aiModel,
          messages: aiMessages,
          ...(activeTools && { tools: activeTools, toolChoice: 'required' }),
          maxOutputTokens: agent.params.max_tokens,
          temperature: agent.params.temperature,
          stopWhen: stepCountIs(5),
          onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-call') {
              log.info(`[Chat Debug] Tool call: ${chunk.toolName}`);
            }
          },
          onStepFinish: ({ toolCalls, text }) => {
            log.info(
              `[Chat Debug] Step finished: tools=${toolCalls?.length || 0}, text=${text?.length || 0} chars`
            );
          },
          experimental_telemetry: { isEnabled: false },
          onFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
            log.info(
              `[Chat Debug] Stream finished: reason=${finishReason}, usage=${JSON.stringify(usage)}`
            );
            if (finishReason === 'error') {
              log.error('[Chat Debug] Stream finished with error');
            }
            log.info(`[Chat Debug] Stream finished:`, {
              textLength: text?.length || 0,
              toolCallsCount: toolCalls?.length || 0,
              toolResultsCount: toolResults?.length || 0,
            });
            if (actualThreadId) {
              try {
                log.info(
                  `[Chat] Saving message: text=${text?.length || 0} chars, toolCalls=${toolCalls?.length || 0}, toolResults=${toolResults?.length || 0}`
                );
                if (toolCalls && toolCalls.length > 0) {
                  log.info(
                    `[Chat] Tool calls: ${JSON.stringify(toolCalls.map((tc: (typeof toolCalls)[0]) => ({ id: tc.toolCallId, name: tc.toolName })))}`
                  );
                }
                if (toolResults && toolResults.length > 0) {
                  log.info(
                    `[Chat] Tool results: ${JSON.stringify(toolResults.map((tr: (typeof toolResults)[0]) => ({ id: tr.toolCallId, hasResult: !!('result' in tr && tr.result) })))}`
                  );
                }
                await createMessage(
                  actualThreadId,
                  'assistant',
                  text,
                  toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
                  toolResults && toolResults.length > 0 ? toolResults : undefined
                );

                await touchThread(actualThreadId);

                if (isNewThread && text) {
                  const aiWorkerPool = (req.app.locals as Record<string, unknown>).aiWorkerPool as
                    | Parameters<typeof generateThreadTitle>[3]
                    | undefined;
                  const userContent = lastUserMessage
                    ? typeof lastUserMessage.content === 'string'
                      ? lastUserMessage.content
                      : JSON.stringify(lastUserMessage.content)
                    : '';
                  if (aiWorkerPool) {
                    generateThreadTitle(actualThreadId, userContent, text, aiWorkerPool).catch(
                      (err) => log.warn('[Chat] Thread title generation failed:', err)
                    );
                  }
                }
              } catch (error) {
                log.error('Failed to save assistant message:', error);
              }
            }
          },
        });
      } catch (streamTextError) {
        log.error('[Chat Debug] streamText creation error:', streamTextError);
        throw streamTextError;
      }

      if (isNewThread && actualThreadId) {
        res.setHeader('X-Thread-Id', actualThreadId);
        log.info(`[Chat Debug] New thread created: ${actualThreadId}`);
      }

      log.info('[Chat Debug] Piping stream to response...');

      // Consume and forward the stream with error handling
      try {
        const response = result.toTextStreamResponse();
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        // Set headers
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          // Log error parts from stream (3: is error prefix in AI SDK data stream)
          if (text.includes('3:')) {
            log.error('[Chat Debug] Error in stream: ' + JSON.stringify(text));
          }
          res.write(value);
        }
        res.end();
        log.info('[Chat Debug] Stream completed');
      } catch (streamErr) {
        log.error('[Chat Debug] Stream consumption error:', streamErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
        }
      }
    } catch (error) {
      log.error('[Chat Debug] Chat API error:', error);
      log.error('[Chat Debug] Error stack:', error instanceof Error ? error.stack : 'No stack');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
