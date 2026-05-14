/**
 * Intent Execution Service
 *
 * Handles board creation, document creation, share_doc intent,
 * and the search/image/summary pipeline execution.
 */

import { findBestMatch } from '@gruenerator/shared/utils';

import {
  briefGeneratorNode,
  searchNode,
  rerankNode,
  imageNode,
  imageEditNode,
  summarizeNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { env } from '../../../config/env.js';
import { type ExpressRequest as SharepicExpressRequest } from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

import { CONFIRM_ACTION_CONFIG } from './confirmActionService.js';
import { extractTextContent } from './messageHelpers.js';
import { pendingActionStore } from './pendingActionStore.js';
import { generateSharepicVariants, type SharepicVariant } from './sharepicVariantHelpers.js';
import { PROGRESS_MESSAGES } from './sseHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter, SearchResultPayload } from './sseHelpers.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ImageAttachment,
  PendingAction,
  SearchIntent,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

/**
 * Handle @board-erstellen forced tool.
 * Returns true if the board was created (caller should return early).
 */
export async function handleBoardCreation(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  lastUserMessage: ModelMessage | undefined;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
}): Promise<boolean> {
  const { sse, classifiedState, lastUserMessage, aiWorkerPool, req, actualThreadId, userId } = opts;

  sse.send('response_start', { message: 'Erstelle Board...' });

  try {
    const {
      BOARD_GENERATION_PROMPT,
      createBoardDocument,
      parseBoardStructure,
      postProcessBoardStructure,
    } = await import('../../../services/boards/BoardService.js');

    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';

    const boardGenResult = await aiWorkerPool.processRequest(
      {
        type: 'board_generation',
        systemPrompt: BOARD_GENERATION_PROMPT,
        messages: [{ role: 'user', content: lastUserText }],
        options: { temperature: 0.7, max_tokens: 2000 },
      },
      req as Express.Request & { user?: { id?: string }; sessionID?: string }
    );

    const boardStructure =
      boardGenResult.success && boardGenResult.content
        ? parseBoardStructure(boardGenResult.content)
        : null;

    if (boardStructure) {
      const { id: newBoardId, title: boardTitle } = await createBoardDocument(
        boardStructure.title || 'Neues Board',
        userId
      );

      const columnNames = boardStructure.statusOptions
        .map((c: { name: string }) => c.name)
        .join(', ');
      const cardCount = boardStructure.rows.length;

      const responseText =
        `Board **"${boardTitle}"** wurde erstellt!\n\n` +
        `**Spalten:** ${columnNames}\n` +
        `**Karten:** ${cardCount} Aufgaben\n\n` +
        `[Board öffnen](/boards/${newBoardId})`;

      for (let i = 0; i < responseText.length; i += 20) {
        sse.send('text_delta', { text: responseText.slice(i, i + 20) });
      }

      const totalTimeMs = Date.now() - classifiedState.startTime;
      sse.sendRaw('done', {
        threadId: actualThreadId,
        citations: [],
        boardId: newBoardId,
        boardGeneratedStructure: postProcessBoardStructure(boardStructure, userId),
        metadata: {
          intent: 'direct',
          searchCount: 0,
          totalTimeMs,
          classificationTimeMs: classifiedState.classificationTimeMs,
          searchTimeMs: 0,
        },
      });

      if (actualThreadId) {
        await createMessage(actualThreadId, 'assistant', responseText);
        await touchThread(actualThreadId);
      }

      log.info(`[ChatGraph] Board created: "${boardTitle}" (${newBoardId})`);
      sse.end();
      return true;
    }
  } catch (boardErr) {
    log.error(
      `[ChatGraph] Board creation failed: ${boardErr instanceof Error ? boardErr.message : String(boardErr)}`
    );
  }

  return false;
}

/**
 * Generate a document using AI and create it.
 * Returns true if the document was created successfully.
 */
export async function generateAndCreateDocument(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
  intent: string;
  skipTerminate?: boolean;
}): Promise<boolean> {
  const {
    sse,
    classifiedState,
    aiWorkerPool,
    req,
    actualThreadId,
    userId,
    userContent,
    subtypeOverride,
    conversationContext,
    intent,
    skipTerminate,
  } = opts;

  if (!skipTerminate) {
    sse.send('response_start', { message: 'Erstelle Dokument...' });
  }

  try {
    const { DOCUMENT_GENERATION_PROMPT, parseDocumentResponse, createDocumentWithContent } =
      await import('../../../services/docs/DocGenerationService.js');

    const subtypeHint = subtypeOverride ? `\nVerwende subtype: "${subtypeOverride}".` : '';

    const userMessage = conversationContext
      ? `Konversationskontext:\n${conversationContext}\n\nAktuelle Anfrage: ${userContent}`
      : userContent;

    const docGenResult = await aiWorkerPool.processRequest(
      {
        type: 'doc_generation',
        systemPrompt: DOCUMENT_GENERATION_PROMPT + subtypeHint,
        messages: [{ role: 'user', content: userMessage }],
        options: { temperature: 0.7, max_tokens: 4000 },
      },
      req as Express.Request & { user?: { id?: string }; sessionID?: string }
    );

    const generated =
      docGenResult.success && docGenResult.content
        ? parseDocumentResponse(docGenResult.content)
        : { title: 'Neues Dokument', subtype: 'blank', content: '' };

    const docSubtype = subtypeOverride || generated.subtype;
    const newDoc = await createDocumentWithContent(
      generated.title,
      generated.content,
      docSubtype,
      userId
    );

    const newDocId = newDoc.id;
    const docTitle = generated.title;

    const responseText = `Dokument **"${docTitle}"** wurde erstellt.`;

    for (let i = 0; i < responseText.length; i += 20) {
      sse.send('text_delta', { text: responseText.slice(i, i + 20) });
    }

    sse.send('document_created', {
      documentId: newDocId,
      title: docTitle,
      subtype: docSubtype,
      url: `/docs/${newDocId}`,
    });

    log.info(`[ChatGraph] Document created (${intent}): "${docTitle}" (${newDocId})`);

    if (!skipTerminate) {
      const totalTimeMs = Date.now() - classifiedState.startTime;
      sse.sendRaw('done', {
        threadId: actualThreadId,
        citations: [],
        documentId: newDocId,
        metadata: {
          intent,
          searchCount: 0,
          totalTimeMs,
          classificationTimeMs: classifiedState.classificationTimeMs,
          searchTimeMs: 0,
        },
      });

      if (actualThreadId) {
        await createMessage(actualThreadId, 'assistant', responseText);
        await touchThread(actualThreadId);
      }

      sse.end();
    }

    return true;
  } catch (docErr) {
    log.error(
      `[ChatGraph] Document creation failed (${intent}): ${docErr instanceof Error ? docErr.message : String(docErr)}`
    );
    return false;
  }
}

/**
 * Handle share_doc intent (short-circuit — no LLM response needed).
 * Returns true if handled (caller should return early).
 */
export async function handleShareDoc(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  actualThreadId: string;
  userId: string;
  lastUserMessage?: ModelMessage;
  rawDocMentionIds?: string[];
  rawDocumentChatIds?: string[];
}): Promise<boolean> {
  const {
    sse,
    classifiedState,
    actualThreadId,
    userId,
    lastUserMessage,
    rawDocMentionIds,
    rawDocumentChatIds,
  } = opts;

  const shareDocDoneMeta = {
    intent: classifiedState.intent,
    searchCount: 0,
    totalTimeMs: Date.now() - classifiedState.startTime,
    classificationTimeMs: classifiedState.classificationTimeMs,
    searchTimeMs: 0,
  };

  async function sendShareDocError(text: string) {
    sse.send('response_start', { message: 'Antwort wird erstellt...' });
    sse.send('text_delta', { text });
    await createMessage(actualThreadId, 'assistant', text);
    await touchThread(actualThreadId);
    sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
    sse.end();
  }

  const { targetGroupName } = classifiedState;
  if (!targetGroupName) {
    await sendShareDocError(
      'Bitte gib an, mit welcher Gruppe du das Dokument teilen möchtest. Beispiel: „Teile das mit AG Umwelt"'
    );
    return true;
  }

  const docId = rawDocMentionIds?.[0] || rawDocumentChatIds?.[0] || null;
  if (!docId) {
    await sendShareDocError(
      'Kein Dokument gefunden. Bitte erwähne ein Dokument mit @Dokument oder erstelle zuerst eins.'
    );
    return true;
  }

  const { getPostgresInstance } = await import('../../../database/services/PostgresService.js');
  const pg = getPostgresInstance();

  const [docRows, userGroups] = await Promise.all([
    pg.query('SELECT title FROM collaborative_documents WHERE id = $1 AND is_deleted = false', [
      docId,
    ]) as Promise<{ title: string }[]>,
    pg.query(
      `SELECT g.id, g.name FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 ORDER BY g.name ASC`,
      [userId]
    ) as Promise<{ id: string; name: string }[]>,
  ]);

  if (!docRows.length) {
    await sendShareDocError('Das referenzierte Dokument wurde nicht gefunden.');
    return true;
  }

  const docTitle = docRows[0].title || 'Unbenanntes Dokument';

  if (userGroups.length === 0) {
    await sendShareDocError(
      'Du bist noch keiner Gruppe beigetreten. Erstelle oder tritt einer Gruppe bei, um Dokumente zu teilen.'
    );
    return true;
  }

  const groupNames = userGroups.map((g) => g.name);
  const match = findBestMatch(targetGroupName, groupNames, 0.5);
  const matchedGroup = match ? userGroups.find((g) => g.name === match.match) : null;

  if (!matchedGroup) {
    const groupList = groupNames.map((n) => `• ${n}`).join('\n');
    await sendShareDocError(
      `Keine passende Gruppe für „${targetGroupName}" gefunden.\n\nDeine Gruppen:\n${groupList}`
    );
    return true;
  }

  const lastUserText = lastUserMessage
    ? extractTextContent(lastUserMessage.content).toLowerCase()
    : '';
  const isReadOnly = /nur lesen|read.?only|leserecht|ansehen|viewer|lesezugriff/.test(lastUserText);
  const permissionLevel = isReadOnly ? ('viewer' as const) : ('editor' as const);
  const permissionLabel = permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen';

  const pendingAction: PendingAction = {
    actionId: `action_${Date.now()}`,
    threadId: actualThreadId,
    userId,
    title: 'Dokument teilen',
    preview: `${docTitle} → ${matchedGroup.name}`,
    createdAt: Date.now(),
    type: 'share_doc',
    payload: {
      docId,
      docTitle,
      groupId: matchedGroup.id,
      groupName: matchedGroup.name,
      permissionLevel,
    },
  };

  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  const responseText = `Dokument **„${docTitle}"** mit **${matchedGroup.name}** teilen (${permissionLabel}):`;
  sse.send('text_delta', { text: responseText });
  await createMessage(actualThreadId, 'assistant', responseText);
  await touchThread(actualThreadId);

  const ssePayload = CONFIRM_ACTION_CONFIG[pendingAction.type];
  sse.send('confirm_action', {
    actionId: pendingAction.actionId,
    type: pendingAction.type,
    title: ssePayload.title,
    description: ssePayload.description,
    icon: ssePayload.icon,
    metadata: [
      { key: 'Dokument', value: docTitle },
      { key: 'Gruppe', value: matchedGroup.name },
      { key: 'Berechtigung', value: permissionLabel },
    ],
    confirmLabel: ssePayload.confirmLabel,
    cancelLabel: 'Abbrechen',
    threadId: actualThreadId,
  });

  await pendingActionStore.store(pendingAction);
  log.info(
    `[ChatGraph] Share confirm action stored: ${pendingAction.actionId} (${docTitle} → ${matchedGroup.name})`
  );

  sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
  sse.end();
  return true;
}

/**
 * Execute the search/image/summary pipeline for each intent.
 */
export async function executeIntentPipeline(opts: {
  classifiedState: ChatGraphState;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean>;
  imageAttachments: ImageAttachment[];
  req?: Request;
}): Promise<{
  finalState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
}> {
  const { classifiedState, sse, forcedTool, enabledTools, imageAttachments } = opts;

  let finalState = classifiedState;
  let generatedImage: GeneratedImageResult | null = null;
  let sharepicVariants: SharepicVariant[] = [];

  // Build ordered list of intents to execute (primary first, then secondary)
  const intentsToExecute: SearchIntent[] = [classifiedState.intent];
  if (
    classifiedState.secondaryIntent &&
    classifiedState.secondaryIntent !== classifiedState.intent
  ) {
    intentsToExecute.push(classifiedState.secondaryIntent);
    log.info(`[ChatGraph] Multi-intent: ${intentsToExecute.join(' → ')}`);
  }

  for (const currentIntent of intentsToExecute) {
    log.info(
      `[ChatGraph] Stage 2 — intent=${currentIntent}, forcedTool=${forcedTool}, enabledTools.image=${enabledTools?.['image']}`
    );
    if (currentIntent === 'image') {
      const imageToolEnabled = forcedTool || enabledTools?.['image'] !== false;
      log.info(
        `[ChatGraph] Image branch — imageToolEnabled=${imageToolEnabled}, userId=${classifiedState.agentConfig.userId}, BFL_KEY_SET=${!!env.BFL_API_KEY}`
      );
      if (imageToolEnabled) {
        sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
        const imageResult = await imageNode(finalState);
        log.info(
          `[ChatGraph] imageNode result — hasImage=${!!imageResult.generatedImage}, error=${imageResult.error || 'none'}, timeMs=${imageResult.imageTimeMs}`
        );
        finalState = { ...finalState, ...imageResult } as ChatGraphState;

        if (finalState.generatedImage) {
          generatedImage = finalState.generatedImage;
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageComplete,
            image: generatedImage,
          });
        } else if (finalState.error) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageError(finalState.error),
            error: finalState.error,
          });
        }
      }
    } else if (currentIntent === 'image_edit') {
      const imageEditToolEnabled = forcedTool || enabledTools?.['image_edit'] !== false;
      if (imageEditToolEnabled) {
        if (!imageAttachments || imageAttachments.length === 0) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageEditNoAttachment,
            error: PROGRESS_MESSAGES.imageEditNoAttachment,
          });
        } else {
          sse.send('image_start', { message: PROGRESS_MESSAGES.imageEditStart });
          const imageEditResult = await imageEditNode(finalState);
          finalState = { ...finalState, ...imageEditResult } as ChatGraphState;

          if (finalState.generatedImage) {
            generatedImage = finalState.generatedImage;
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageEditComplete,
              image: generatedImage,
            });
          } else if (finalState.error) {
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageError(finalState.error),
              error: finalState.error,
            });
          }
        }
      }
    } else if (currentIntent === 'sharepic') {
      sse.send('image_start', { message: 'Erstelle Sharepic-Varianten...' });
      try {
        const lastMsg = finalState.messages?.[finalState.messages.length - 1];
        const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
        const messageText = rawText.replace(/@sharepic\b/gi, '').trim();
        log.info(`[ChatGraph] Sharepic topic: "${messageText.slice(0, 100)}"`);

        if (!opts.req) throw new Error('Express request required for sharepic generation');
        const variants = await generateSharepicVariants({
          req: opts.req as SharepicExpressRequest,
          text: messageText,
        });

        if (variants.length === 0) {
          sse.send('sharepic_complete', {
            message: 'Sharepic-Erstellung fehlgeschlagen',
            variants: [],
            error: 'All variant generations failed',
          });
        } else {
          sse.send('sharepic_complete', {
            message: `${variants.length} Sharepic-Varianten erstellt`,
            variants,
          });
          sharepicVariants = variants;
        }
      } catch (error) {
        log.error('[ChatGraph] Sharepic variant generation failed:', error);
        sse.send('sharepic_complete', {
          message: 'Sharepic-Erstellung fehlgeschlagen',
          variants: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else if (currentIntent === 'summary') {
      const docCount =
        (finalState.documentChatIds?.length || 0) + (finalState.documentIds?.length || 0);
      sse.send('summary_start', {
        message: PROGRESS_MESSAGES.summaryStart,
        documentCount: docCount,
      });
      const summaryResult = await summarizeNode(finalState);
      finalState = { ...finalState, ...summaryResult } as ChatGraphState;
      const summaryLength = finalState.summaryContext?.length || 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summaryLength, finalState.summaryTimeMs || 0),
        summaryLength,
        timeMs: finalState.summaryTimeMs || 0,
      });
    } else if (
      currentIntent !== 'direct' &&
      currentIntent !== 'save_as_doc' &&
      currentIntent !== 'modify_doc' &&
      currentIntent !== 'modify_board'
    ) {
      const toolEnabled = forcedTool || enabledTools?.[currentIntent] !== false;
      if (toolEnabled) {
        let searchInputState = finalState;
        const willGenerateBrief =
          ['complex', 'moderate'].includes(finalState.complexity) && currentIntent === 'research';
        const briefStepId = willGenerateBrief ? `brief_${Date.now()}` : null;
        if (willGenerateBrief && briefStepId) {
          // brief generator is a silent LLM call (~1–3s); ping so the UI doesn't
          // sit on the stale "intent" message during this window.
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'in_progress',
          });
          const briefResult = await briefGeneratorNode(finalState);
          searchInputState = { ...finalState, ...briefResult } as ChatGraphState;
          sse.send('progress_step', {
            stepId: briefStepId,
            toolName: 'brief',
            title: 'Plane Recherche…',
            status: 'completed',
          });
        }

        const isDeepResearch = currentIntent === 'research';
        sse.send('search_start', {
          message: isDeepResearch
            ? 'Tiefgehende Recherche läuft (mehrere Quellen, dauert ca. 15–20s)…'
            : PROGRESS_MESSAGES.searchStart,
          ...(finalState.subQueries?.length && { subQueries: finalState.subQueries }),
        });

        if (isDeepResearch) {
          searchInputState = {
            ...searchInputState,
            onResearchProgress: (message: string) => {
              sse.send('search_start', { message });
            },
          } as ChatGraphState;
        }
        const searchResult = await searchNode(searchInputState);
        finalState = { ...searchInputState, ...searchResult } as ChatGraphState;

        if (finalState.searchResults?.length > 2) {
          const rerankStepId = `rerank_${Date.now()}`;
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'in_progress',
          });
          const rerankResult = await rerankNode(finalState);
          finalState = { ...finalState, ...rerankResult } as ChatGraphState;
          if (finalState.searchResults.length > 0) {
            finalState.citations = buildCitations(finalState.searchResults);
          }
          sse.send('progress_step', {
            stepId: rerankStepId,
            toolName: 'rerank',
            title: 'Bewerte Quellen…',
            status: 'completed',
          });
        }

        const resultCount = finalState.searchResults?.length || 0;
        const payloadResults =
          finalState.searchResults?.slice(0, 10).map((r) => {
            const result: SearchResultPayload = {
              source: r.source,
              title: r.title,
              content: r.content,
            };
            if (r.url != null) result.url = r.url;
            if (r.relevance != null) result.relevance = r.relevance;
            return result;
          }) || [];
        sse.send('search_complete', {
          message: PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results: payloadResults,
          ...(currentIntent === 'research' && finalState.researchMeta
            ? { researchMeta: finalState.researchMeta }
            : {}),
          ...((currentIntent === 'examples' || currentIntent === 'pressemitteilung_examples') &&
          finalState.examplesResult
            ? { examplesResult: finalState.examplesResult }
            : {}),
        });
      }
    }
  }

  return { finalState, generatedImage, sharepicVariants };
}
