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
  computeNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { env } from '../../../config/env.js';
import { type ExpressRequest as SharepicExpressRequest } from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

import { CONFIRM_ACTION_CONFIG } from './confirmActionService.js';
import { extractTextContent } from './messageHelpers.js';
import { pendingActionStore } from './pendingActionStore.js';
import {
  detectPreferredVariant,
  generateSharepicVariants,
  type PriorSharepic,
  type SharepicVariant,
} from './sharepicVariantHelpers.js';
import { generateSliderDeckVariant } from './sliderDeckService.js';
import { PROGRESS_MESSAGES } from './sseHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter, SearchResultPayload } from './sseHelpers.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ImageAttachment,
  PendingAction,
  SearchIntent,
  SocialPostPayload,
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
 * Handle the create_sheet intent / @sheet-erstellen forced tool: generate a
 * structured spreadsheet, create the collaborative_documents row (subtype
 * 'sheets') and seed its Y.Doc. Mirrors generateAndCreateDocument — the
 * created sheet streams through the same `document_created` SSE event and
 * metadata, so the existing chat card and thread-reload rehydration work
 * unchanged (they navigate via the carried `url`).
 * Returns true if the sheet was created (caller should return early).
 */
export async function handleSheetCreation(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
}): Promise<boolean> {
  const { sse, classifiedState, aiWorkerPool, req, actualThreadId, userId, userContent } = opts;

  let streamOpened = false;
  try {
    const { SHEET_GENERATION_PROMPT, parseSheetStructure, createSheetDocument } =
      await import('../../../services/sheets/SheetGenerationService.js');

    const genResult = await aiWorkerPool.processRequest(
      {
        type: 'doc_generation',
        systemPrompt: SHEET_GENERATION_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        options: { temperature: 0.4, max_tokens: 4000 },
      },
      req as Express.Request & { user?: { id?: string }; sessionID?: string }
    );

    const structure =
      genResult.success && genResult.content ? parseSheetStructure(genResult.content) : null;
    if (!structure) {
      // Nothing streamed yet — return false so the caller falls through to the
      // normal respond pipeline cleanly (no dangling response_start).
      log.warn('[ChatGraph] Sheet generation returned no parseable structure');
      return false;
    }

    // Only open the stream once we know we're committing to the sheet.
    sse.send('response_start', { message: 'Erstelle Tabelle...' });
    streamOpened = true;

    const newSheet = await createSheetDocument(structure, userId);

    const responseText = `Tabelle **"${newSheet.title}"** wurde erstellt.`;
    for (let i = 0; i < responseText.length; i += 20) {
      sse.send('text_delta', { text: responseText.slice(i, i + 20) });
    }

    sse.send('document_created', {
      documentId: newSheet.id,
      title: newSheet.title,
      subtype: 'sheets',
      url: `/office/${newSheet.id}`,
    });

    log.info(`[ChatGraph] Sheet created: "${newSheet.title}" (${newSheet.id})`);

    const totalTimeMs = Date.now() - classifiedState.startTime;
    sse.sendRaw('done', {
      threadId: actualThreadId,
      citations: [],
      documentId: newSheet.id,
      metadata: {
        intent: 'create_sheet',
        searchCount: 0,
        totalTimeMs,
        classificationTimeMs: classifiedState.classificationTimeMs,
        searchTimeMs: 0,
      },
    });

    if (actualThreadId) {
      await createMessage(actualThreadId, 'assistant', responseText, {
        intent: 'create_sheet',
        createdDocument: {
          documentId: newSheet.id,
          title: newSheet.title,
          subtype: 'sheets',
          url: `/office/${newSheet.id}`,
        },
      });
      await touchThread(actualThreadId);
    }

    sse.end();
    return true;
  } catch (sheetErr) {
    log.error(
      `[ChatGraph] Sheet creation failed: ${sheetErr instanceof Error ? sheetErr.message : String(sheetErr)}`
    );
    if (streamOpened) {
      // The stream is already open; don't fall through (that would double the
      // response). Close it with a short error message instead.
      const msg = 'Die Tabelle konnte nicht erstellt werden.';
      sse.send('text_delta', { text: msg });
      sse.sendRaw('done', {
        threadId: actualThreadId,
        citations: [],
        metadata: { intent: 'create_sheet' },
      });
      sse.end();
      return true;
    }
    return false;
  }
}

export async function handlePresentationCreation(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
}): Promise<boolean> {
  const { sse, classifiedState, aiWorkerPool, req, actualThreadId, userId, userContent } = opts;

  let streamOpened = false;
  try {
    const {
      PRESENTATION_GENERATION_PROMPT,
      parsePresentationStructure,
      createPresentationDocument,
    } = await import('../../../services/presentations/PresentationGenerationService.js');

    const genResult = await aiWorkerPool.processRequest(
      {
        type: 'doc_generation',
        systemPrompt: PRESENTATION_GENERATION_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        options: { temperature: 0.4, max_tokens: 4000 },
      },
      req as Express.Request & { user?: { id?: string }; sessionID?: string }
    );

    const structure =
      genResult.success && genResult.content ? parsePresentationStructure(genResult.content) : null;
    if (!structure) {
      // Nothing streamed yet — return false so the caller falls through to the
      // normal respond pipeline cleanly (no dangling response_start).
      log.warn('[ChatGraph] Presentation generation returned no parseable structure');
      return false;
    }

    // Only open the stream once we know we're committing to the presentation.
    sse.send('response_start', { message: 'Erstelle Präsentation...' });
    streamOpened = true;

    const newPresentation = await createPresentationDocument(structure, userId);

    const responseText = `Präsentation **"${newPresentation.title}"** wurde erstellt.`;
    for (let i = 0; i < responseText.length; i += 20) {
      sse.send('text_delta', { text: responseText.slice(i, i + 20) });
    }

    sse.send('document_created', {
      documentId: newPresentation.id,
      title: newPresentation.title,
      subtype: 'presentations',
      url: `/office/${newPresentation.id}`,
    });

    log.info(
      `[ChatGraph] Presentation created: "${newPresentation.title}" (${newPresentation.id})`
    );

    const totalTimeMs = Date.now() - classifiedState.startTime;
    sse.sendRaw('done', {
      threadId: actualThreadId,
      citations: [],
      documentId: newPresentation.id,
      metadata: {
        intent: 'create_presentation',
        searchCount: 0,
        totalTimeMs,
        classificationTimeMs: classifiedState.classificationTimeMs,
        searchTimeMs: 0,
      },
    });

    if (actualThreadId) {
      await createMessage(actualThreadId, 'assistant', responseText, {
        intent: 'create_presentation',
        createdDocument: {
          documentId: newPresentation.id,
          title: newPresentation.title,
          subtype: 'presentations',
          url: `/office/${newPresentation.id}`,
        },
      });
      await touchThread(actualThreadId);
    }

    sse.end();
    return true;
  } catch (presentationErr) {
    log.error(
      `[ChatGraph] Presentation creation failed: ${presentationErr instanceof Error ? presentationErr.message : String(presentationErr)}`
    );
    if (streamOpened) {
      // The stream is already open; don't fall through (that would double the
      // response). Close it with a short error message instead.
      const msg = 'Die Präsentation konnte nicht erstellt werden.';
      sse.send('text_delta', { text: msg });
      sse.sendRaw('done', {
        threadId: actualThreadId,
        citations: [],
        metadata: { intent: 'create_presentation' },
      });
      sse.end();
      return true;
    }
    return false;
  }
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
      url: `/office/${newDocId}`,
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
        // Persist the created-document descriptor so the DocumentCreatedCard
        // rehydrates on thread reload. Without this the card is streamed live
        // via `document_created` but the reloaded message is bare text.
        await createMessage(actualThreadId, 'assistant', responseText, {
          intent,
          createdDocument: {
            documentId: newDocId,
            title: docTitle,
            subtype: docSubtype,
            url: `/office/${newDocId}`,
          },
        });
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
/**
 * Resolve the author name for quote sharepics from the user's profile.
 * Returns an empty string when no userId or display name is available — the
 * quote then renders without an author line instead of failing.
 */
async function resolveSharepicAuthorName(userId?: string): Promise<string> {
  if (!userId) return '';
  try {
    const { getProfileService } = await import('../../../services/user/ProfileService.js');
    const profile = await getProfileService().getProfileById(userId);
    return profile?.display_name?.trim() || '';
  } catch (err) {
    log.warn(`[ChatGraph] Could not resolve sharepic author name: ${err}`);
    return '';
  }
}

/**
 * Sharepic-variant generation shared by the `sharepic` intent and the
 * sharepic half of the EXPERIMENTAL `social_post` intent. Emits its own
 * `sharepic_complete` (including error payloads) and returns the variants
 * ([] on failure) so callers never have to duplicate the SSE handling.
 */
async function runSharepicGeneration(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  req?: Request | undefined;
  threadId?: string | null;
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
}): Promise<SharepicVariant[]> {
  const { state, sse } = opts;
  try {
    const lastMsg = state.messages?.[state.messages.length - 1];
    const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
    const messageText = rawText.replace(/@sharepic\b/gi, '').trim();
    const refinement = opts.sharepicRefinement;
    const preferredVariant = refinement ? null : detectPreferredVariant(messageText);

    // Quote sharepics are attributed to the person creating them — default the
    // author to the user's profile display name. Empty when no profile name
    // exists, in which case the quote renders without an author line.
    const authorName = await resolveSharepicAuthorName(state.agentConfig?.userId);

    log.info(
      `[ChatGraph] Sharepic topic: "${messageText.slice(0, 100)}", ` +
        `${refinement ? `refinement: "${refinement.instruction}" (${refinement.prior.canvasType})` : `preferredVariant: ${preferredVariant ?? 'all'}`}, ` +
        `author: ${authorName || '(none)'}`
    );

    if (!opts.req) throw new Error('Express request required for sharepic generation');
    // Slider = multi-page deck, a different artifact: ONE deck variant,
    // minted at generation time (studio open/editing need the pages).
    let variants: SharepicVariant[];
    if (preferredVariant === 'slider') {
      const userId = state.agentConfig?.userId;
      if (!userId) throw new Error('User required for slider deck creation');
      variants = [
        await generateSliderDeckVariant({
          req: opts.req,
          text: messageText,
          threadId: opts.threadId ?? null,
          userId,
        }),
      ];
    } else {
      variants = await generateSharepicVariants({
        req: opts.req as SharepicExpressRequest,
        text: messageText,
        ...(refinement ? { refinement } : preferredVariant ? { preferredVariant } : {}),
        ...(authorName && { authorName }),
        ...(state.userLocale && { userLocale: state.userLocale }),
      });
    }

    if (variants.length === 0) {
      sse.send('sharepic_complete', {
        message: 'Sharepic-Erstellung fehlgeschlagen',
        variants: [],
        error: 'All variant generations failed',
      });
      return [];
    }
    sse.send('sharepic_complete', {
      message: `${variants.length} Sharepic-Varianten erstellt`,
      variants,
    });
    return variants;
  } catch (error) {
    log.error('[ChatGraph] Sharepic variant generation failed:', error);
    sse.send('sharepic_complete', {
      message: 'Sharepic-Erstellung fehlgeschlagen',
      variants: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

export async function executeIntentPipeline(opts: {
  classifiedState: ChatGraphState;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean>;
  imageAttachments: ImageAttachment[];
  req?: Request;
  /** Thread id for deck mints (chat_thread_canvases binding). */
  threadId?: string | null;
  /** When set, the sharepic branch refines the previous sharepic instead of starting fresh. */
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
}): Promise<{
  finalState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
  /** Text half of the EXPERIMENTAL social_post intent; null otherwise. */
  socialPost: SocialPostPayload | null;
}> {
  const { classifiedState, sse, forcedTool, enabledTools, imageAttachments } = opts;

  let finalState = classifiedState;
  let generatedImage: GeneratedImageResult | null = null;
  let sharepicVariants: SharepicVariant[] = [];
  let socialPost: SocialPostPayload | null = null;

  // Build ordered list of intents to execute (primary first, then secondary).
  // social_post handles pasted URLs inline BEFORE text generation — a
  // trailing scrape_url iteration would crawl after the post is written.
  const intentsToExecute: SearchIntent[] = [classifiedState.intent];
  if (
    classifiedState.secondaryIntent &&
    classifiedState.secondaryIntent !== classifiedState.intent &&
    !(classifiedState.intent === 'social_post' && classifiedState.secondaryIntent === 'scrape_url')
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
      sharepicVariants = await runSharepicGeneration({
        state: finalState,
        sse,
        req: opts.req,
        threadId: opts.threadId ?? null,
        ...(opts.sharepicRefinement && { sharepicRefinement: opts.sharepicRefinement }),
      });
    } else if (currentIntent === 'social_post') {
      // EXPERIMENTAL combined post: sharepic variants + platform text run in
      // parallel; each half emits its SSE event as soon as it resolves (text
      // usually lands first, so the card shows it while thumbnails render).
      // Agents with sharepic disabled degrade to text-only; a failed text
      // half degrades to plain sharepic behavior (the error payload on
      // social_post_complete tells the card).
      const sharepicEnabled = forcedTool || enabledTools?.['sharepic'] !== false;
      sse.send('image_start', {
        message: sharepicEnabled ? 'Texte und gestalte deinen Post...' : 'Texte deinen Post...',
      });

      const sharepicHalf: Promise<SharepicVariant[]> = sharepicEnabled
        ? runSharepicGeneration({
            state: finalState,
            sse,
            req: opts.req,
            threadId: opts.threadId ?? null,
          })
        : Promise.resolve([]);

      const stateForText = finalState;
      const textHalf: Promise<{
        state: ChatGraphState;
        post: SocialPostPayload;
      }> = (async () => {
        // Pasted URLs must ground the text ("schreib einen Tweet zu <URL>"),
        // so crawl them HERE, before generation — the secondary-intent loop
        // iteration would run only after the text already exists (it is
        // skipped for social_post, see intentsToExecute above).
        let urlContext: ChatGraphState['searchResults'] = [];
        if ((stateForText.detectedUrls?.length ?? 0) > 0) {
          try {
            const scrape = await searchNode({
              ...stateForText,
              intent: 'scrape_url',
            } as ChatGraphState);
            urlContext = scrape.searchResults ?? [];
          } catch (error) {
            log.warn(`[ChatGraph] social_post URL crawl failed: ${error}`);
          }
        }
        // Ground the text on real posts (same retrieval as `examples`) —
        // unless the agent/user disabled the examples tool; the composer
        // prompt handles zero examples ("Keine Vorlagen verfügbar"). A
        // failed search degrades the same way.
        let textState = stateForText;
        const examplesEnabled = forcedTool || enabledTools?.['examples'] !== false;
        if (examplesEnabled) {
          try {
            const searchResult = await searchNode(stateForText);
            textState = { ...stateForText, ...searchResult } as ChatGraphState;
          } catch (error) {
            log.warn(`[ChatGraph] social_post examples search failed: ${error}`);
          }
        }
        if (urlContext.length > 0) {
          // Keep crawled pages on state too so citations persist with the turn.
          textState = {
            ...textState,
            searchResults: [...(textState.searchResults ?? []), ...urlContext],
            citations: [...(textState.citations ?? []), ...buildCitations(urlContext)],
          } as ChatGraphState;
        }
        const { generateSocialPostText } = await import('./socialPostService.js');
        const post = await generateSocialPostText({
          state: textState,
          urlContext,
          ...(opts.req && { req: opts.req }),
        });
        sse.send('social_post_complete', {
          message: `${post.platform === 'generic' ? 'Social-Media' : post.platform}-Post erstellt`,
          post,
        });
        return { state: textState, post };
      })();

      const [variantsSettled, textSettled] = await Promise.allSettled([sharepicHalf, textHalf]);

      if (variantsSettled.status === 'fulfilled') {
        sharepicVariants = variantsSettled.value;
      }
      if (textSettled.status === 'fulfilled') {
        socialPost = textSettled.value.post;
        // Keep the examples retrieval on state so persistence/citations work
        // like the examples flow.
        finalState = {
          ...textSettled.value.state,
          socialPostResult: socialPost,
        } as ChatGraphState;
      } else {
        log.error('[ChatGraph] social_post text generation failed:', textSettled.reason);
        sse.send('social_post_complete', {
          message: 'Post-Text konnte nicht erstellt werden',
          error: textSettled.reason instanceof Error ? textSettled.reason.message : 'Unknown error',
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
    } else if (currentIntent === 'compute') {
      // Deterministic calculation. computeNode runs the math in plain JS and
      // stores the verified result on finalState.computedResult; the respond
      // node then injects it into the prompt so the model only phrases (never
      // recomputes) the number. The `compute` SSE event drives the inline
      // "Berechnung" card so the user sees a tool produced the figure.
      const computeResult = await computeNode(finalState);
      finalState = { ...finalState, ...computeResult } as ChatGraphState;
      if (finalState.computedResult) {
        finalState.computedResultFresh = true;
        sse.send('compute', { compute: finalState.computedResult });
      }
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

        // Dedicated Bundestag card: the structured DIP result rides alongside
        // the flat search_complete results (which stay for grounding/citations).
        if (currentIntent === 'bundestag' && finalState.bundestagResult) {
          sse.send('bundestag', { bundestag: finalState.bundestagResult });
        }
      }
    }
  }

  return { finalState, generatedImage, sharepicVariants, socialPost };
}
