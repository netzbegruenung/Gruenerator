/**
 * Deep Agent Controller (Default)
 *
 * Primary route handler for the ReAct-based chat system.
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
import { imageNode } from '../../agents/langgraph/ChatGraph/nodes/imageNode.js';
import { TOOL_LABELS } from '../../agents/langgraph/ChatGraph/tools/registry.js';
import { isKnownNotebook, resolveNotebookCollections } from '../../config/notebookCollectionMap.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { generateThreadTitle } from '../../services/chat/threadTitleService.js';
import { trimMessagesToTokenLimit } from '../../services/counters/TokenCounter.js';
import { getMem0Instance } from '../../services/mem0/index.js';
import { OCRService } from '../../services/OcrService/index.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { getAgent } from './agents/agentLoader.js';
import {
  saveThreadAttachment,
  getThreadAttachments,
} from './services/attachmentPersistenceService.js';
import { createSSEStream, PROGRESS_MESSAGES } from './services/sseHelpers.js';

import type {
  ChatGraphState,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  Citation,
} from '../../agents/langgraph/ChatGraph/types.js';
import type { Message as TokenCounterMessage } from '../../services/counters/types.js';
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
        log.error(
          `[${requestId}] Failed to extract text from ${attachment.name}: ${error instanceof Error ? error.message : String(error)}`
        );
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

/**
 * Detect image generation intent using the same heuristic as classifierNode.
 * Matches German patterns like "erstelle ein bild von..." with 0.92 confidence.
 */
function detectImageIntent(text: string): boolean {
  const q = text.toLowerCase();
  const imageKeywords =
    /\b(erstell|generier|visualisier|zeichne|male|illustrier).{0,20}(bild|grafik|illustration|foto|image|poster|sharepic)\b/i;
  const imageKeywordsAlt =
    /\b(bild|grafik|illustration|foto|poster|sharepic).{0,20}(erstell|generier|erzeug|mach)\b/i;
  return imageKeywords.test(q) || imageKeywordsAlt.test(q);
}

/**
 * Handle image generation directly via imageNode, bypassing the ReAct agent.
 * Mirrors the ChatGraph's proven image handling flow.
 */
async function handleDirectImageGeneration(params: {
  sse: ReturnType<typeof createSSEStream>;
  requestId: string;
  startTime: number;
  userId: string;
  agentId: string;
  validMessages: any[];
  lastUserMessage: any;
  actualThreadId: string | undefined;
  isNewThread: boolean;
  aiWorkerPool: any;
}): Promise<void> {
  const {
    sse,
    requestId,
    startTime,
    userId,
    agentId,
    validMessages,
    lastUserMessage,
    actualThreadId,
    isNewThread,
    aiWorkerPool,
  } = params;

  const stepId = `img_${Date.now()}`;

  // Send thinking step: image generation starting
  sse.sendRaw('thinking_step', {
    stepId,
    toolName: 'generate_image',
    title: 'Bild generieren',
    status: 'in_progress',
    args: {},
  });

  // Build minimal ChatGraphState for imageNode
  const agentConfig = await getAgent(agentId || 'gruenerator-universal');
  if (!agentConfig) {
    sse.send('error', { error: 'Agent not found' });
    sse.end();
    return;
  }
  (agentConfig as any).userId = userId;

  const minimalState = {
    messages: validMessages,
    agentConfig,
    enabledTools: { image: true },
    aiWorkerPool,
    threadId: actualThreadId || null,
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    memoryContext: null,
  } as unknown as ChatGraphState;

  // Run imageNode (wrapped in try/catch for user-visible errors)
  let generatedImage: GeneratedImageResult | null = null;
  let imageError: string | null = null;
  let imageTimeMs = 0;

  try {
    const imageResult = await imageNode(minimalState);
    generatedImage = imageResult.generatedImage || null;
    imageError = imageResult.error || null;
    imageTimeMs = imageResult.imageTimeMs || 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[${requestId}] imageNode threw: ${msg}`);
    imageError = 'Bildgenerierung fehlgeschlagen. Bitte versuche es erneut.';
    imageTimeMs = Date.now() - startTime;
  }

  // Send thinking step: completed
  sse.sendRaw('thinking_step', {
    stepId,
    toolName: 'generate_image',
    title: 'Bild generieren',
    status: 'completed',
    result: {
      image: generatedImage,
      error: imageError,
    },
  });

  // Generate a short text response about the image
  let fullText = '';
  if (generatedImage) {
    try {
      const userText = extractTextContent(lastUserMessage.content);
      const result = await aiWorkerPool.processRequest(
        {
          type: 'chat_response',
          provider: 'mistral',
          systemPrompt:
            'Du bist ein hilfreicher Assistent. Ein Bild wurde basierend auf der Anfrage des Nutzers generiert. Beschreibe kurz, was erstellt wurde, und biete an, Anpassungen vorzunehmen.',
          messages: [{ role: 'user', content: userText }],
          options: { model: 'mistral-small-latest', max_tokens: 300, temperature: 0.7 },
        },
        null
      );

      fullText = result?.content || '';
    } catch (err) {
      log.warn(
        `[${requestId}] Text generation after image failed: ${err instanceof Error ? err.message : String(err)}`
      );
      fullText = 'Hier ist dein generiertes Bild! Möchtest du Anpassungen vornehmen?';
    }
  } else if (imageError) {
    fullText = imageError;
  }

  // Stream text response
  if (fullText) {
    sse.send('text_delta', { text: fullText });
  }

  // Persist assistant message
  if (actualThreadId && (fullText || generatedImage)) {
    try {
      await createMessage(actualThreadId, 'assistant', fullText || null, {
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

      if (isNewThread && lastUserMessage) {
        const userText = extractTextContent(lastUserMessage.content);
        generateThreadTitle(actualThreadId, userText, fullText, aiWorkerPool, {
          imageGenerated: !!generatedImage,
        }).catch((err: unknown) =>
          log.warn(
            `[DeepAgent] Thread title generation failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    } catch (error) {
      log.error(
        `[DeepAgent] Error persisting image message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Done event
  const totalTimeMs = Date.now() - startTime;
  sse.send('done', {
    threadId: actualThreadId,
    citations: [],
    generatedImage,
    metadata: {
      intent: 'image' as any,
      searchCount: 0,
      totalTimeMs,
      imageTimeMs,
    },
  });

  log.info(`[DeepAgent] Image generation complete in ${totalTimeMs}ms`);
  sse.end();
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
      notebookIds: rawNotebookIds,
    } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
      modelId?: string;
      attachments?: ProcessedAttachment[];
      notebookIds?: string[];
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
      log.error(
        `[DeepAgent] Error converting messages: ${err instanceof Error ? err.message : String(err)}`
      );
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
    let imageAttachments: ImageAttachment[] = [];
    let processedMeta: ProcessedAttachmentMeta[] = [];
    if (attachments?.length) {
      const processed = await processAttachments(attachments, requestId);
      attachmentContext = processed.attachmentContext;
      imageAttachments = processed.imageAttachments;
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
        log.warn(
          `[${requestId}] Memory retrieval failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Validate and resolve notebook mentions
    const notebookIds = rawNotebookIds?.filter(isKnownNotebook) || [];
    const notebookCollectionIds =
      notebookIds.length > 0 ? resolveNotebookCollections(notebookIds) : [];
    let notebookContext: string | undefined;

    if (notebookCollectionIds.length > 0) {
      log.info(
        `[DeepAgent] Notebook scoping: ${notebookIds.join(', ')} → collections: ${notebookCollectionIds.join(', ')}`
      );
      notebookContext = `## NOTIZBUCH-KONTEXT

Der Nutzer hat folgende Notizbücher ausgewählt: ${notebookIds.join(', ')}

Wenn du search_documents verwendest, beschränke die Suche auf die zugehörigen Sammlungen: ${notebookCollectionIds.join(', ')}
Übergib den Parameter collection_ids mit diesen Werten an search_documents.`;
    }

    // Fast path: detect image requests and handle directly, bypassing ReAct agent
    if (lastUserMessage) {
      const lastUserText = extractTextContent(lastUserMessage.content);
      const isImageRequest = detectImageIntent(lastUserText);
      log.debug(
        `[DeepAgent] Image intent check: "${lastUserText.slice(0, 60)}" → ${isImageRequest}`
      );
      if (isImageRequest && enabledTools?.image !== false) {
        log.info(`[DeepAgent] Image intent detected, using direct image generation`);
        await handleDirectImageGeneration({
          sse,
          requestId,
          startTime,
          userId,
          agentId: agentId || 'gruenerator-universal',
          validMessages,
          lastUserMessage,
          actualThreadId,
          isNewThread,
          aiWorkerPool,
        });
        return;
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
        image_edit: true,
      },
      aiWorkerPool,
      attachmentContext: attachmentContext || undefined,
      threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
      imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
      memoryContext,
      notebookContext,
      notebookCollectionIds: notebookCollectionIds.length > 0 ? notebookCollectionIds : undefined,
    });

    // Context pruning: trim long conversations to token budget
    const MAX_CONTEXT_TOKENS = 6000;
    const messagesForTokenCount: TokenCounterMessage[] = validMessages.map((msg: any) => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((p: any) => p?.type === 'text')
                .map((p: any) => p.text || '')
                .join('')
            : '',
    }));

    const prunedTokenMessages = trimMessagesToTokenLimit(messagesForTokenCount, MAX_CONTEXT_TOKENS);
    const keepCount = prunedTokenMessages.filter((m) => m.role !== 'system').length;
    const conversationMessages = validMessages.filter((m: any) => m.role !== 'system');
    const prunedMessages = conversationMessages.slice(-keepCount);

    if (prunedMessages.length < conversationMessages.length) {
      log.info(
        `[DeepAgent] Context pruned: ${conversationMessages.length} → ${prunedMessages.length} messages`
      );
    }

    // Convert messages to LangChain format
    const langChainMessages = convertToLangChainMessages(prunedMessages as any);

    // Stream agent events
    const stream = agent.graph.streamEvents(
      { messages: langChainMessages },
      { version: 'v2', recursionLimit: 20 }
    );

    let fullText = '';
    const toolCalls: Array<{ name: string; args: any; output: string; runId: string }> = [];
    let isStreamingFinalResponse = false;
    const toolStartTimes = new Map<string, number>();

    const SEARCH_TOOLS = new Set(['search_documents', 'web_search', 'research', 'search_examples']);
    const IMAGE_TOOLS = new Set(['generate_image', 'edit_image']);

    try {
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
            toolStartTimes.set(event.run_id, Date.now());
            log.info(`[DeepAgent] Tool start: ${toolName}`);

            sse.sendRaw('thinking_step', {
              stepId: event.run_id,
              toolName,
              title,
              status: 'in_progress',
              args: event.data?.input,
            });

            // Emit structured events for frontend progress UI
            if (SEARCH_TOOLS.has(toolName)) {
              sse.sendRaw('search_start', { message: PROGRESS_MESSAGES.searchStart, toolName });
            } else if (IMAGE_TOOLS.has(toolName)) {
              sse.sendRaw('image_start', { message: PROGRESS_MESSAGES.imageStart, toolName });
            }
            break;
          }

          case 'on_tool_end': {
            const toolName = event.name;
            const title = TOOL_LABELS[toolName] || toolName;
            const output =
              typeof event.data?.output === 'string'
                ? event.data.output
                : JSON.stringify(event.data?.output || '');
            const toolDurationMs = toolStartTimes.has(event.run_id)
              ? Date.now() - toolStartTimes.get(event.run_id)!
              : undefined;
            toolStartTimes.delete(event.run_id);

            toolCalls.push({
              name: toolName,
              args: event.data?.input || {},
              output,
              runId: event.run_id,
            });

            log.info(
              `[DeepAgent] Tool end: ${toolName} (${output.length} chars${toolDurationMs ? `, ${toolDurationMs}ms` : ''})`
            );

            const resultCount = countResultsInOutput(output);
            const parsedResults = parseToolOutputResults(output);

            sse.sendRaw('thinking_step', {
              stepId: event.run_id,
              toolName,
              title,
              status: 'completed',
              result: { resultCount, ...(parsedResults.length > 0 && { results: parsedResults }) },
            });

            // Emit structured completion events for frontend progress UI
            if (SEARCH_TOOLS.has(toolName)) {
              sse.sendRaw('search_complete', {
                message: PROGRESS_MESSAGES.searchComplete(resultCount),
                resultCount,
                toolName,
                durationMs: toolDurationMs,
              });
            } else if (IMAGE_TOOLS.has(toolName)) {
              sse.sendRaw('image_complete', {
                message: PROGRESS_MESSAGES.imageComplete,
                image: agent.deps._generatedImage || null,
                toolName,
                durationMs: toolDurationMs,
              });
            }
            break;
          }
        }
      }
    } catch (streamError: unknown) {
      const msg = streamError instanceof Error ? streamError.message : JSON.stringify(streamError);
      const stack = streamError instanceof Error ? streamError.stack : undefined;
      log.error(`[DeepAgent] Stream iteration error: ${msg}`);
      if (stack) {
        log.error(`[DeepAgent] Stream stack: ${stack}`);
      }

      // If we already have partial text, try to send what we have.
      // Otherwise send a helpful error message as a text response.
      if (!fullText) {
        fullText =
          'Es ist ein Fehler bei der Verarbeitung aufgetreten. Bitte versuche es erneut oder formuliere deine Anfrage anders.';
        sse.send('text_delta', { text: fullText });
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
          const userText = extractTextContent(lastUserMessage!.content);
          generateThreadTitle(actualThreadId!, userText, fullText, aiWorkerPool, {
            imageGenerated: !!generatedImage,
          }).catch((err: unknown) =>
            log.warn(
              `[DeepAgent] Thread title generation failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      } catch (error) {
        log.error(
          `[DeepAgent] Error persisting message: ${error instanceof Error ? error.message : String(error)}`
        );
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
          log.error(
            `[DeepAgent] Failed to save attachment ${meta.name}: ${err instanceof Error ? err.message : String(err)}`
          );
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
        .catch((err: unknown) =>
          log.warn(
            `[${requestId}] Async memory save failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error(
      `[DeepAgent] Controller error (${error instanceof Error ? 'Error' : typeof error}): ${errorMessage || '(empty message)'}`
    );
    if (errorStack) {
      log.error(`[DeepAgent] Controller stack: ${errorStack}`);
    }
    if (!(error instanceof Error)) {
      log.error(`[DeepAgent] Raw error value: ${JSON.stringify(error)?.slice(0, 500)}`);
    }
    if (!sse.isEnded()) {
      const userFacingMessage =
        'Es ist ein Fehler aufgetreten. Bitte versuche es erneut oder formuliere deine Anfrage anders.';
      sse.send('text_delta', { text: userFacingMessage });
      sse.send('done', {
        threadId: undefined,
        citations: [],
        generatedImage: undefined,
        metadata: {
          intent: 'direct' as any,
          searchCount: 0,
          totalTimeMs: Date.now() - startTime,
        },
      });
      sse.end();
    }
  }
});

function countResultsInOutput(output: string): number {
  const matches = output.match(/\[\d+\]/g);
  return matches ? matches.length : 0;
}

function parseToolOutputResults(
  output: string
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const pattern = /\[(\d+)\]\s+(.+?)\s+\((https?:\/\/[^\s)]+)\)\n([\s\S]*?)(?=\n\n\[\d+\]|$)/g;
  let match;
  while ((match = pattern.exec(output)) !== null) {
    results.push({
      title: match[2].trim(),
      url: match[3].trim(),
      snippet: match[4].trim().slice(0, 200),
    });
  }
  return results;
}

export default router;
