/**
 * Chat Streaming Controller
 * Handles AI chat streaming via Vercel AI SDK
 */

import express from 'express';
import { streamText, tool, CoreMessage, Tool } from 'ai';
import { z } from 'zod';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getAgent, getDefaultAgentId } from './agents/agentLoader.js';
import {
  executeDirectSearch,
  executeDirectPersonSearch,
  executeDirectExamplesSearch,
  executeDirectWebSearch,
  executeResearch,
} from './agents/directSearch.js';
import type { ResearchResult } from './agents/directSearch.js';
import { getModel, isProviderConfigured } from './agents/providers.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import type { UserProfile } from '../../services/user/types.js';
import type { AgentConfig } from './agents/types.js';
import {
  getCompactionState,
  prepareMessagesWithCompaction,
} from './services/compactionService.js';

const log = createLogger('ChatStreamController');
const router = createAuthenticatedRouter();

type ToolKey = 'search' | 'web' | 'person' | 'examples' | 'research' | 'direct';

type SearchToolName =
  | 'gruenerator_search'
  | 'gruenerator_person_search'
  | 'gruenerator_examples_search'
  | 'web_search'
  | 'research'
  | 'direct_response';

const TOOL_KEY_TO_NAME: Record<ToolKey, SearchToolName> = {
  search: 'gruenerator_search',
  web: 'web_search',
  person: 'gruenerator_person_search',
  examples: 'gruenerator_examples_search',
  research: 'research',
  direct: 'direct_response',
};

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

const ALL_COLLECTIONS = [
  'deutschland',
  'oesterreich',
  'bundestagsfraktion',
  'kommunalwiki',
  'examples',
  'gruene-de',
  'gruene-at',
  'boell-stiftung',
] as const;

type CollectionType = (typeof ALL_COLLECTIONS)[number];

/**
 * Creates search tools dynamically based on agent configuration.
 * This enables per-agent restrictions on collections (e.g., Austrian agent
 * can only search Austrian collections).
 *
 * Note: Returns Record<string, unknown> due to Zod version conflicts in monorepo.
 * Type safety is maintained through runtime validation in execute functions.
 */
function createSearchTools(agentConfig: AgentConfig): Record<string, unknown> {
  const restrictions = agentConfig.toolRestrictions;

  const allowedCollections: readonly string[] = restrictions?.allowedCollections?.length
    ? restrictions.allowedCollections
    : ALL_COLLECTIONS;

  const defaultCollection = restrictions?.defaultCollection || allowedCollections[0];
  const examplesCountry = restrictions?.examplesCountry;
  const personSearchEnabled = restrictions?.personSearchEnabled !== false;

  log.debug(
    `[Tools] Creating tools for ${agentConfig.identifier}: collections=${allowedCollections.join(',')}, default=${defaultCollection}, personSearch=${personSearchEnabled}, examplesCountry=${examplesCountry || 'all'}`
  );

  const tools: Record<string, unknown> = {};

  tools.gruenerator_search = tool({
    description: `Durchsuche grüne Parteiprogramme, Positionen und Beschlüsse.

NUTZE WENN:
- Fragen zu grünen Positionen ("Was sagen die Grünen zu...")
- Politische Standpunkte oder Beschlüsse benötigt
- Zitate aus Parteiprogrammen gewünscht
- Grüne Politik/Programmatik gefragt

NICHT FÜR: Aktuelle Nachrichten, Personen-Infos, allgemeine Web-Suche`,
    parameters: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      collection: z
        .enum(allowedCollections as [string, ...string[]])
        .optional()
        .default(defaultCollection)
        .describe(`Sammlung: ${allowedCollections.join(', ')}`),
      limit: z.number().optional().default(5).describe('Maximale Anzahl Ergebnisse'),
    }),
    execute: async ({ query, collection, limit }) => {
      try {
        if (!allowedCollections.includes(collection)) {
          log.warn(`[Tools] Collection "${collection}" not allowed for ${agentConfig.identifier}`);
          return {
            error: 'Sammlung nicht verfügbar',
            results: [],
            collection,
            query,
          };
        }
        const results = await executeDirectSearch({ query, collection, limit });
        return results;
      } catch (error) {
        log.error('Direct search error:', error);
        return { error: 'Suche fehlgeschlagen', results: [], collection, query };
      }
    },
  });

  if (personSearchEnabled) {
    tools.gruenerator_person_search = tool({
      description: `Suche nach grünen Politiker*innen und deren Funktionen.

NUTZE WENN:
- "Wer ist [Name]?" oder "Wer war [Name]?"
- Fragen nach Funktionen/Ämtern von Grünen-Politiker*innen
- Biografie-Informationen über grüne Persönlichkeiten

NICHT FÜR: Allgemeine Personensuche außerhalb der Grünen`,
      parameters: z.object({
        query: z.string().describe('Name oder Funktion der Person'),
      }),
      execute: async ({ query }) => {
        try {
          const results = await executeDirectPersonSearch({ query });
          return results;
        } catch (error) {
          log.error('Direct person search error:', error);
          return { error: 'Personensuche fehlgeschlagen', results: [], isPersonQuery: false };
        }
      },
    });
  }

  tools.gruenerator_examples_search = tool({
    description: `Suche nach Social-Media-Beispielen und Vorlagen.

NUTZE WENN:
- Beispiele für Social-Media-Posts gesucht
- Vorlagen für Instagram oder Facebook benötigt
- Inspiration für grüne Social-Media-Kommunikation

NICHT FÜR: Allgemeine Informationssuche, Fakten, Nachrichten`,
    parameters: z.object({
      query: z.string().describe('Thema oder Stichwort'),
      platform: z.enum(['instagram', 'facebook']).optional().describe('Plattform filtern'),
    }),
    execute: async ({ query, platform }) => {
      try {
        const results = await executeDirectExamplesSearch({
          query,
          platform,
          country: examplesCountry,
        });
        return results;
      } catch (error) {
        log.error('Direct examples search error:', error);
        return { error: 'Beispielsuche fehlgeschlagen', examples: [], resultsCount: 0 };
      }
    },
  });

  tools.web_search = tool({
    description: `Suche im Internet nach aktuellen Informationen und Nachrichten.

NUTZE WENN:
- Aktuelle Ereignisse oder Nachrichten gefragt
- Informationen außerhalb der Grünen-Dokumentation
- Allgemeine Fakten aus dem Web
- Externe Quellen benötigt

NICHT FÜR: Grüne Parteiprogramme (nutze gruenerator_search), Grüne Personen (nutze gruenerator_person_search)`,
    parameters: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      searchType: z
        .enum(['general', 'news'])
        .optional()
        .default('general')
        .describe('Suchtyp: general (allgemein) oder news (Nachrichten)'),
      maxResults: z.number().optional().default(5).describe('Maximale Anzahl Ergebnisse (1-10)'),
    }),
    execute: async ({ query, searchType, maxResults }) => {
      try {
        const results = await executeDirectWebSearch({ query, searchType, maxResults });
        return results;
      } catch (error) {
        log.error('Direct web search error:', error);
        return { error: 'Websuche fehlgeschlagen', results: [], resultsCount: 0, query };
      }
    },
  });

  // Research tool: Perplexity-style structured research with planning, multi-source search, and synthesis
  tools.research = tool({
    description: `Strukturierte Recherche mit Planung, Suche und Synthese.

NUTZE WENN:
- Der Benutzer "recherchiere", "suche nach", "finde heraus" sagt
- Komplexe Fragen mit mehreren Aspekten
- Vergleiche verschiedener Quellen gewünscht
- Themen die Kontext aus mehreren Bereichen brauchen
- Explizite Recherche-Anfragen ("nutze das recherche tool")

Das Tool plant automatisch, sucht in relevanten Quellen, und synthetisiert mit Inline-Zitaten [1], [2].

NICHT FÜR: Einfache Begrüßungen, Dankeschöns, kreative Aufgaben ohne Faktenbedarf`,
    parameters: z.object({
      question: z.string().describe('Die Frage oder das Thema für die Recherche'),
      depth: z
        .enum(['quick', 'thorough'])
        .optional()
        .default('quick')
        .describe('Recherchetiefe: quick (schnell, 1-2 Quellen) oder thorough (gründlich, mehr Quellen)'),
    }),
    execute: async ({ question, depth }) => {
      try {
        log.info(`[Research Tool] Starting research: "${question.slice(0, 50)}..." (depth: ${depth})`);
        const result = await executeResearch({
          question,
          depth,
          maxSources: depth === 'thorough' ? 10 : 6,
        });
        log.info(`[Research Tool] Complete: ${result.citations.length} citations, confidence: ${result.confidence}`);
        return result;
      } catch (error) {
        log.error('Research tool error:', error);
        return {
          answer: 'Die Recherche konnte leider nicht durchgeführt werden.',
          citations: [],
          followUpQuestions: [],
          searchSteps: [],
          confidence: 'low' as const,
          error: 'Recherche fehlgeschlagen',
        };
      }
    },
  });

  // Direct response tool: escape hatch for non-search cases
  tools.direct_response = tool({
    description: `Antworte direkt ohne externe Suche.

NUTZE DIESES TOOL WENN:
- Begrüßungen/Verabschiedungen ("Hallo", "Danke", "Tschüss")
- Allgemeine Konversation ohne Informationsbedarf
- Kreative Aufgaben mit bereits gegebenen Infos (z.B. Instagram-Posts, Texte schreiben)
- Klarstellende Nachfragen
- Der Benutzer explizit KEINE Suche möchte
- Einfache Folgefragen zu bereits besprochenen Themen

NICHT NUTZEN wenn Fakten, aktuelle Infos oder Belege gefragt sind.`,
    parameters: z.object({
      content: z.string().describe('Die vollständige Antwort an den Benutzer'),
      reason: z.string().optional().describe('Optional: Warum keine Suche nötig war'),
    }),
    execute: async ({ content, reason }) => {
      log.debug(`[Direct Response] Content length: ${content?.length}, Reason: ${reason}`);
      return { type: 'direct', content, reason };
    },
  });

  return tools;
}

async function createThread(
  userId: string,
  agentId: string,
  title?: string
): Promise<{ id: string; user_id: string; agent_id: string; title: string | null }> {
  const postgres = getPostgresInstance();
  const result = await postgres.query<{
    id: string;
    user_id: string;
    agent_id: string;
    title: string | null;
  }>(
    `INSERT INTO chat_threads (user_id, agent_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  );
  return result[0];
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
  await postgres.query(
    `UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [threadId]
  );
}

async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_threads SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [title, threadId]
  );
}

router.post('/', async (req, res) => {
  try {
    const { messages, agentId, provider, model, threadId, enabledTools } = req.body;

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
        contentLength: typeof lastMsg.content === 'string' ? lastMsg.content.length : JSON.stringify(lastMsg.content).length,
        contentPreview: typeof lastMsg.content === 'string' ? lastMsg.content.slice(0, 100) : JSON.stringify(lastMsg.content).slice(0, 100),
      });
    }

    const user = getUser(req);
    if (!user?.id) {
      log.warn('[Chat Debug] Unauthorized - no user');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = user.id;
    log.info(`[Chat Debug] User: ${userId}`);

    const agent = await getAgent(agentId || getDefaultAgentId());
    if (!agent) {
      log.warn(`[Chat Debug] Agent not found: ${agentId}`);
      return res.status(404).json({ error: 'Agent not found' });
    }
    log.info(`[Chat Debug] Agent loaded: ${agent.identifier}`);

    const effectiveProvider = provider || agent.provider;
    const effectiveModel = model || agent.model;
    log.info(`[Chat Debug] Provider: ${effectiveProvider}, Model: ${effectiveModel}`);

    const lastUserMessage = messages.filter((m: CoreMessage) => m.role === 'user').pop();

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

    const baseSystemMessage = `${agent.systemRole}

## TOOL-NUTZUNG

Du MUSST für jede Nachricht ein Tool wählen. Entscheide semantisch basierend auf dem Inhalt:

### SUCH-TOOLS (für Informationsbedarf)
- **research** - Komplexe Fragen, explizite Recherche-Anfragen ("recherchiere", "suche nach", "finde heraus")
- **gruenerator_search** - Grüne Programme, Positionen, Beschlüsse
- **gruenerator_person_search** - Grüne Politiker*innen-Infos ("Wer ist...", "Wer war...")
- **web_search** - Aktuelle Nachrichten, externe Fakten
- **gruenerator_examples_search** - Social-Media-Vorlagen und -Beispiele

### DIREKT-TOOL (keine Suche nötig)
- **direct_response** - Begrüßungen, Dank, kreative Aufgaben ohne Faktenbedarf

### ENTSCHEIDUNGSLOGIK
1. Fragt der Benutzer nach Fakten/Informationen? → Such-Tool
2. Sagt der Benutzer "suche", "recherchiere", "finde"? → research
3. Nennt der Benutzer ein spezifisches Tool? → Das genannte Tool
4. Ist es Begrüßung/Dank/Small-Talk? → direct_response

## ANTWORT-VERHALTEN

1. **Fokus**: Beantworte NUR was gefragt wurde. Keine ungebetene Spekulation.
2. **Kürze**: Kurze, präzise Antworten. Maximal 3-4 Absätze für einfache Fragen.
3. **Zitieren**: Bei research-Tool Inline-Zitate [1], [2] in Antwort übernehmen.
4. **Quellen**: Relevante Quellen am Ende nennen wenn Suche durchgeführt.

Im Zweifel lieber suchen als raten. Antworte auf Deutsch. Erfinde keine Fakten.`;

    // Load compaction state if thread exists
    let compactionState = { summary: null, compactedUpToMessageId: null, compactionUpdatedAt: null };
    if (actualThreadId) {
      try {
        compactionState = await getCompactionState(actualThreadId);
        if (compactionState.summary) {
          log.info(`[Chat] Thread ${actualThreadId} has compaction summary (${compactionState.summary.length} chars)`);
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

    const aiMessages: CoreMessage[] = [{ role: 'system', content: systemMessage }, ...preparedMessages];

    if (!isProviderConfigured(effectiveProvider)) {
      log.error(`[Chat Debug] Provider not configured: ${effectiveProvider}`);
      return res.status(500).json({ error: `Provider "${effectiveProvider}" is not configured` });
    }
    log.info(`[Chat Debug] Provider configured: ${effectiveProvider}`);

    const aiModel = getModel(effectiveProvider, effectiveModel);
    log.info(`[Chat Debug] AI Model obtained: ${effectiveModel}`);

    const hasTools = agent.plugins?.includes('gruenerator-mcp');
    log.info(`[Chat Debug] hasTools: ${hasTools}, agent.plugins: ${JSON.stringify(agent.plugins)}`);

    // Create tools dynamically based on agent configuration (enables per-agent restrictions)
    const agentTools = createSearchTools(agent);

    // Filter tools based on user-enabled toggles
    const filteredTools: Record<string, unknown> = {};
    if (hasTools && enabledTools) {
      for (const [key, toolName] of Object.entries(TOOL_KEY_TO_NAME)) {
        // direct_response is always included as the escape hatch
        if (toolName === 'direct_response' || (enabledTools[key as ToolKey] && agentTools[toolName])) {
          filteredTools[toolName] = agentTools[toolName];
        }
      }
    } else if (hasTools) {
      // Fallback: all tools enabled if no enabledTools provided
      Object.assign(filteredTools, agentTools);
    }

    const activeTools = Object.keys(filteredTools).length > 0 ? filteredTools : undefined;

    // AI decides semantically which tool to use
    // direct_response tool is the escape hatch for non-search cases
    log.info(`[Chat Debug] Tool config: hasTools=${hasTools}, activeTools=${Object.keys(filteredTools)}, toolChoice=${activeTools ? 'required' : 'none'}`);
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
        tools: activeTools,
        // Always require tool choice - AI uses direct_response when no search needed
        toolChoice: activeTools ? 'required' : undefined,
        maxTokens: agent.params.max_tokens,
        temperature: agent.params.temperature,
        maxSteps: 5,
        onChunk: ({ chunk }) => {
          if (chunk.type === 'tool-call') {
            log.info(`[Chat Debug] Tool call: ${chunk.toolName}`);
          }
        },
        onStepFinish: ({ stepType, toolCalls, toolResults, text }) => {
          log.info(`[Chat Debug] Step finished: type=${stepType}, tools=${toolCalls?.length || 0}, text=${text?.length || 0} chars`);
        },
        experimental_telemetry: { isEnabled: false },
        onFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
          log.info(`[Chat Debug] Stream finished: reason=${finishReason}, usage=${JSON.stringify(usage)}`);
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
            log.info(`[Chat] Saving message: text=${text?.length || 0} chars, toolCalls=${toolCalls?.length || 0}, toolResults=${toolResults?.length || 0}`);
            if (toolCalls && toolCalls.length > 0) {
              log.info(`[Chat] Tool calls: ${JSON.stringify(toolCalls.map(tc => ({ id: tc.toolCallId, name: tc.toolName })))}`);
            }
            if (toolResults && toolResults.length > 0) {
              log.info(`[Chat] Tool results: ${JSON.stringify(toolResults.map(tr => ({ id: tr.toolCallId, hasResult: !!tr.result })))}`);
            }
            await createMessage(
              actualThreadId,
              'assistant',
              text,
              toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
              toolResults && toolResults.length > 0 ? toolResults : undefined
            );

            await touchThread(actualThreadId);

            if (isNewThread && text && text.length > 10) {
              const firstSentence = text.split(/[.!?]/)[0];
              const title =
                firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
              if (title && title.length > 5) {
                await updateThreadTitle(actualThreadId, title);
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
      const response = result.toDataStreamResponse();
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
});

export default router;
