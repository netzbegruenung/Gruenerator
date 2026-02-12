/**
 * Deep Agent Controller
 *
 * Route handler for the ReAct-based deep agent chat system.
 * Uses SSE streaming with thinking_step events for tool call visibility.
 *
 * SSE Event Flow:
 * 1. thread_created - New thread ID (if created)
 * 2. thinking_step (in_progress) - Tool call starting
 * 3. thinking_step (completed) - Tool call done with results
 * 4. text_delta - Streaming text chunks (multiple, from final response)
 * 5. done - Final metadata with citations, images, and timing
 *
 * Steps 2-4 may repeat multiple times as the agent iterates.
 */

import { convertToModelMessages } from 'ai';

import {
  createDeepAgent,
  convertToLangChainMessages,
} from '../../agents/langgraph/ChatGraph/deepAgent.js';
import { TOOL_LABELS } from '../../agents/langgraph/ChatGraph/tools/registry.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getMem0Instance } from '../../services/mem0/index.js';
import { OCRService } from '../../services/OcrService/index.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import {
  saveThreadAttachment,
  getThreadAttachments,
} from './services/attachmentPersistenceService.js';
import { createSSEStream, PROGRESS_MESSAGES } from './services/sseHelpers.js';

import type {
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  Citation,
} from '../../agents/langgraph/ChatGraph/types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { UIMessage } from 'ai';
import type express from 'express';

const log = createLogger('ChatDeepController');
const router = createAuthenticatedRouter();

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: string; text: string } =>
          part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join('');
  }
  return '';
}

const ocrService = new OCRService();

interface ProcessedAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  extractedText: string | null;
}

async function processAttachments(
  attachments: ProcessedAttachment[] | undefined,
  requestId: string
): Promise<{
  attachmentContext: string;
  imageAttachments: ImageAttachment[];
  processedMeta: ProcessedAttachmentMeta[];
}> {
  if (!attachments || attachments.length === 0) {
    return { attachmentContext: '', imageAttachments: [], processedMeta: [] };
  }

  const imageAttachments: ImageAttachment[] = [];
  const documentTexts: string[] = [];
  const processedMeta: ProcessedAttachmentMeta[] = [];

  for (const attachment of attachments) {
    if (IMAGE_MIME_TYPES.has(attachment.type)) {
      imageAttachments.push({
        name: attachment.name,
        type: attachment.type,
        data: attachment.data,
      });
      processedMeta.push({
        name: attachment.name,
        mimeType: attachment.type,
        sizeBytes: attachment.size,
        isImage: true,
        extractedText: null,
      });
      log.info(`[${requestId}] Added image attachment: ${attachment.name}`);
    } else {
      try {
        const result = await ocrService.extractTextFromBase64PDF(attachment.data, attachment.name);
        if (result.text?.length) {
          documentTexts.push(`### ${attachment.name}\n\n${result.text}`);
          processedMeta.push({
            name: attachment.name,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
            isImage: false,
            extractedText: result.text,
          });
          log.info(`[${requestId}] Extracted ${result.text.length} chars from: ${attachment.name}`);
        }
      } catch (error) {
        log.error(`[${requestId}] Failed to extract text from ${attachment.name}:`, error);
        documentTexts.push(`### ${attachment.name}\n\n[Fehler beim Extrahieren des Textes]`);
        processedMeta.push({
          name: attachment.name,
          mimeType: attachment.type,
          sizeBytes: attachment.size,
          isImage: false,
          extractedText: null,
        });
      }
    }
  }

  return {
    attachmentContext: documentTexts.join('\n\n---\n\n'),
    imageAttachments,
    processedMeta,
  };
}

async function createThread(userId: string, agentId: string, title?: string) {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title) VALUES ($1, $2, $3) RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  )) as { id: string; user_id: string; agent_id: string; title: string | null }[];
  return result[0];
}

async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>
) {
  const postgres = getPostgresInstance();
  await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results) VALUES ($1, $2, $3, $4)`,
    [threadId, role, content, metadata ? JSON.stringify(metadata) : null]
  );
}

async function touchThread(threadId: string) {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    threadId,
  ]);
}

async function updateThreadTitle(threadId: string, title: string) {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_threads SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [title, threadId]
  );
}

/**
 * Extract citations from tool call results in the agent's message history.
 * Parses URL references from search tool outputs.
 */
function extractCitationsFromToolResults(
  toolCalls: Array<{ name: string; args: any; output: string }>
): Citation[] {
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();
  let citationId = 1;

  for (const tc of toolCalls) {
    if (!tc.output) continue;

    // Extract URLs from tool output using the [N] Title (URL) pattern
    const urlPattern = /\[(\d+)\]\s*(.+?)\s*\(([^)]+)\)/g;
    let match;
    while ((match = urlPattern.exec(tc.output)) !== null) {
      const url = match[3];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const title = match[2].trim();
      let domain: string | undefined;
      try {
        domain = new URL(url).hostname;
      } catch {
        /* skip */
      }

      citations.push({
        id: citationId++,
        title,
        url,
        snippet: '',
        source: tc.name,
        domain,
      });
    }
  }

  return citations;
}

/**
 * POST /api/chat-deep/stream
 *
 * Process a chat message using the ReAct deep agent with SSE thinking step events.
 */
router.post('/stream', async (req, res) => {
  const sse = createSSEStream(res);
  const requestId = `deep_${Date.now()}`;
  const startTime = Date.now();

  try {
    const {
      messages: clientMessages,
      agentId,
      threadId,
      enabledTools,
      modelId,
      attachments,
    } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
      modelId?: string;
      attachments?: ProcessedAttachment[];
    };

    const user = getUser(req);
    if (!user?.id) {
      sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
      sse.end();
      return;
    }

    const userId = user.id;
    const aiWorkerPool = req.app.locals.aiWorkerPool;

    if (!aiWorkerPool) {
      sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
      sse.end();
      return;
    }

    if (!clientMessages?.length) {
      sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired });
      sse.end();
      return;
    }

    log.info(
      `[DeepAgent] Processing for user ${userId}, agent ${agentId || 'default'}, ${clientMessages.length} messages`
    );

    // Convert client messages to ModelMessage format
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(clientMessages);
    } catch (err) {
      log.error('[DeepAgent] Error converting messages:', err);
      sse.send('error', { error: 'Failed to process messages' });
      sse.end();
      return;
    }

    const validMessages = modelMessages.filter((msg) => {
      if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) return msg.content.length > 0;
        return msg.content && String(msg.content).length > 0;
      }
      return true;
    });

    const lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

    // Create thread if needed
    let actualThreadId = threadId;
    let isNewThread = false;

    if (!actualThreadId && lastUserMessage) {
      const userText = extractTextContent(lastUserMessage.content);
      const thread = await createThread(
        userId,
        agentId || 'gruenerator-universal',
        userText.slice(0, 50) + (userText.length > 50 ? '...' : '') || 'Neue Unterhaltung'
      );
      actualThreadId = thread.id;
      isNewThread = true;
      sse.send('thread_created', { threadId: actualThreadId });
    }

    // Save user message
    if (actualThreadId && lastUserMessage) {
      await createMessage(actualThreadId, 'user', extractTextContent(lastUserMessage.content));
    }

    // Process attachments
    let attachmentContext = '';
    let processedMeta: ProcessedAttachmentMeta[] = [];
    if (attachments?.length) {
      const processed = await processAttachments(attachments, requestId);
      attachmentContext = processed.attachmentContext;
      processedMeta = processed.processedMeta;
    }

    // Load previous thread attachments
    const previousAttachments = actualThreadId ? await getThreadAttachments(actualThreadId, 5) : [];

    // Memory retrieval
    let memoryContext: string | null = null;
    const mem0 = getMem0Instance();
    if (mem0 && lastUserMessage) {
      try {
        const userQuery = extractTextContent(lastUserMessage.content);
        const memories = await mem0.searchMemories(userQuery, userId, 5);
        if (memories.length > 0) {
          memoryContext = memories.map((m: any) => `- ${m.memory}`).join('\n');
        }
      } catch (err) {
        log.warn(`[${requestId}] Memory retrieval failed:`, err);
      }
    }

    // Create the deep agent
    const agent = await createDeepAgent({
      agentId: agentId || 'gruenerator-universal',
      userId,
      modelId,
      enabledTools: enabledTools || {
        search: true,
        web: true,
        research: true,
        examples: true,
        image: true,
      },
      aiWorkerPool,
      attachmentContext: attachmentContext || undefined,
      threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
      memoryContext,
    });

    // Convert messages to LangChain format
    const langChainMessages = convertToLangChainMessages(validMessages as any);

    // Stream agent events
    const stream = agent.graph.streamEvents(
      { messages: langChainMessages },
      { version: 'v2', recursionLimit: 20 }
    );

    let fullText = '';
    const toolCalls: Array<{ name: string; args: any; output: string; runId: string }> = [];
    let isStreamingFinalResponse = false;

    for await (const event of stream) {
      switch (event.event) {
        case 'on_chat_model_stream': {
          // Only stream tokens from the top-level agent LLM (not from tools that use LLMs internally)
          if (event.tags?.includes('seq:step:1') || event.metadata?.langgraph_node === 'agent') {
            const content = event.data?.chunk?.content;
            if (typeof content === 'string' && content) {
              if (!isStreamingFinalResponse) {
                isStreamingFinalResponse = true;
              }
              fullText += content;
              sse.send('text_delta', { text: content });
            }
          }
          break;
        }

        case 'on_tool_start': {
          isStreamingFinalResponse = false;
          const toolName = event.name;
          const title = TOOL_LABELS[toolName] || toolName;
          log.info(`[DeepAgent] Tool start: ${toolName}`);

          sse.sendRaw('thinking_step', {
            stepId: event.run_id,
            toolName,
            title,
            status: 'in_progress',
            args: event.data?.input,
          });
          break;
        }

        case 'on_tool_end': {
          const toolName = event.name;
          const title = TOOL_LABELS[toolName] || toolName;
          const output =
            typeof event.data?.output === 'string'
              ? event.data.output
              : JSON.stringify(event.data?.output || '');

          toolCalls.push({
            name: toolName,
            args: event.data?.input || {},
            output,
            runId: event.run_id,
          });

          log.info(`[DeepAgent] Tool end: ${toolName} (${output.length} chars)`);

          sse.sendRaw('thinking_step', {
            stepId: event.run_id,
            toolName,
            title,
            status: 'completed',
            result: {
              resultCount: countResultsInOutput(output),
            },
          });
          break;
        }
      }
    }

    // Extract citations and image from tool results
    const citations = extractCitationsFromToolResults(toolCalls);
    const generatedImage = agent.deps._generatedImage || null;

    // Persist assistant message
    if (actualThreadId && (fullText || generatedImage)) {
      try {
        await createMessage(actualThreadId, 'assistant', fullText || null, {
          toolCalls: toolCalls.map((tc) => ({
            toolCallId: tc.runId,
            toolName: tc.name,
            args: tc.args,
            result: { output: tc.output.slice(0, 2000) },
          })),
          citations,
          generatedImage: generatedImage
            ? {
                url: generatedImage.url,
                filename: generatedImage.filename,
                prompt: generatedImage.prompt,
                style: generatedImage.style,
              }
            : undefined,
        });

        await touchThread(actualThreadId);

        if (isNewThread) {
          let title: string | null = null;
          if (fullText && fullText.length > 10) {
            const firstSentence = fullText.split(/[.!?]/)[0];
            title = firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
          } else if (generatedImage) {
            title = 'Generiertes Bild';
          }
          if (title && title.length > 3) {
            await updateThreadTitle(actualThreadId, title);
          }
        }
      } catch (error) {
        log.error('[DeepAgent] Error persisting message:', error);
      }
    }

    // Save attachments
    if (actualThreadId && processedMeta.length > 0) {
      for (const meta of processedMeta) {
        try {
          await saveThreadAttachment({
            threadId: actualThreadId,
            messageId: null,
            userId,
            name: meta.name,
            mimeType: meta.mimeType,
            sizeBytes: meta.sizeBytes,
            isImage: meta.isImage,
            extractedText: meta.extractedText,
          });
        } catch (err) {
          log.error(`[DeepAgent] Failed to save attachment ${meta.name}:`, err);
        }
      }
    }

    // Async memory saving
    if (mem0 && lastUserMessage && fullText) {
      const userText = extractTextContent(lastUserMessage.content);
      mem0
        .addMemories(
          [
            { role: 'user', content: userText },
            { role: 'assistant', content: fullText },
          ],
          userId,
          { threadId: actualThreadId }
        )
        .catch((err: any) => log.warn(`[${requestId}] Async memory save failed:`, err));
    }

    // Done event
    const totalTimeMs = Date.now() - startTime;
    sse.send('done', {
      threadId: actualThreadId,
      citations,
      generatedImage,
      metadata: {
        intent: 'direct' as any,
        searchCount: toolCalls.filter((tc) =>
          ['search_documents', 'web_search', 'research'].includes(tc.name)
        ).length,
        totalTimeMs,
      },
    });

    log.info(
      `[DeepAgent] Complete: ${fullText.length} chars, ${toolCalls.length} tool calls in ${totalTimeMs}ms`
    );
    sse.end();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[DeepAgent] Controller error:', errorMessage);
    if (!sse.isEnded()) {
      sse.send('error', { error: PROGRESS_MESSAGES.internalError });
      sse.end();
    }
  }
});

function countResultsInOutput(output: string): number {
  const matches = output.match(/\[\d+\]/g);
  return matches ? matches.length : 0;
}

export default router;
