/**
 * Context Enrichment Service
 *
 * Enriches the initialized ChatGraphState with external context:
 * document references, text references, board context, doc mentions,
 * and large document vectorization.
 */

import { truncateDocument } from '../../../agents/langgraph/ChatGraph/nodes/respondNode.js';
import { createLogger } from '../../../utils/logger.js';

import { fetchDocumentContext, fetchTextContext } from './documentContextService.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { SSEWriter } from './sseHelpers.js';
import type {
  ChatGraphState,
  ProcessedAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatGraphController');

export async function enrichContext(opts: {
  initialState: ChatGraphState;
  userId: string;
  rawDocumentIds?: string[];
  rawTextIds?: string[];
  rawBoardIds?: string[];
  rawDocMentionIds?: string[];
  docAttachments: ProcessedAttachment[];
  processedMeta: ProcessedAttachmentMeta[];
  contextWindowTokens: number;
  sse: SSEWriter;
}): Promise<void> {
  const {
    initialState,
    userId,
    rawDocumentIds,
    rawTextIds,
    rawBoardIds,
    rawDocMentionIds,
    docAttachments,
    processedMeta,
    contextWindowTokens,
    sse,
  } = opts;

  // Handle @datei document references
  if (rawDocumentIds?.length) {
    try {
      const docResult = await fetchDocumentContext(userId, rawDocumentIds);
      if (docResult.text) {
        initialState.attachmentContext = initialState.attachmentContext
          ? `${initialState.attachmentContext}\n\n---\n\n## REFERENZIERTE DOKUMENTE\n\n${docResult.text}`
          : `## REFERENZIERTE DOKUMENTE\n\n${docResult.text}`;
      } else if (docResult.documents.length > 0) {
        initialState.documentIds = docResult.documents.map((d) => d.id);
      }
    } catch (err) {
      log.warn(
        `[ChatGraph] Document context retrieval failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Handle @text references
  if (rawTextIds?.length) {
    try {
      const textResult = await fetchTextContext(userId, rawTextIds);
      if (textResult.text) {
        initialState.attachmentContext = initialState.attachmentContext
          ? `${initialState.attachmentContext}\n\n---\n\n## REFERENZIERTE TEXTE\n\n${textResult.text}`
          : `## REFERENZIERTE TEXTE\n\n${textResult.text}`;
        log.info(
          `[ChatGraph] Text context injected: ${textResult.totalChars} chars from ${textResult.count} text(s)`
        );
      }
    } catch (err) {
      log.warn(
        `[ChatGraph] Text context retrieval failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Fetch board context (from @board mentions)
  if (rawBoardIds?.length) {
    try {
      const { loadBoardState, formatBoardAsContext } =
        await import('../../../services/boards/BoardService.js');

      const boardStates = await Promise.all(
        rawBoardIds.map((boardId) =>
          loadBoardState(boardId, userId).catch((err) => {
            log.warn(
              `[ChatGraph] Failed to load board ${boardId}: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          })
        )
      );

      const boardContextParts = boardStates
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .map((s) => {
          log.info(
            `[ChatGraph] Board context loaded: "${s.title}" (${s.fields.length} fields, ${s.rows.length} rows)`
          );
          return formatBoardAsContext(s);
        });

      if (boardContextParts.length > 0) {
        initialState.boardContext = boardContextParts.join('\n\n');
      }
    } catch (importErr) {
      log.warn(
        `[ChatGraph] Board context services unavailable: ${importErr instanceof Error ? importErr.message : String(importErr)}`
      );
    }
  }

  // Fetch collaborative document context (from @doc mentions)
  if (rawDocMentionIds?.length) {
    try {
      const { getPostgresInstance } =
        await import('../../../database/services/PostgresService/PostgresService.js');
      const dbInst = getPostgresInstance();

      const docResults = await dbInst.query(
        `SELECT id, title, content FROM collaborative_documents
         WHERE id = ANY($1::uuid[]) AND is_deleted = false AND document_subtype != 'boards'
         AND (created_by = $2 OR permissions ? $2::text OR is_public = true
              OR id IN (SELECT gcs.content_id FROM group_content_shares gcs
                        INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2
                        WHERE gcs.content_type = 'collaborative_documents'))`,
        [rawDocMentionIds, userId]
      );

      if (docResults.length > 0) {
        // Per-doc budget scales with context window: 8K for 128K models, 2K for 16K models
        const perDocBudget = Math.max(2000, Math.min(8000, Math.floor(contextWindowTokens * 0.25)));
        const docParts = (
          docResults as Array<{ id: string; title: string; content: string | null }>
        )
          .filter((d) => d.content)
          .map((d) => {
            let plainText = d.content || '';
            let prevText: string;
            do {
              prevText = plainText;
              plainText = plainText.replace(/<[^>]+>/g, '');
            } while (plainText !== prevText);
            plainText = plainText
              .replace(/&[a-zA-Z]+;/g, ' ')
              .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            const truncated = truncateDocument(plainText, perDocBudget);
            if (truncated.length < plainText.length) {
              log.info(
                `[ChatGraph] Doc context truncated: "${d.title}" (${plainText.length} → ${truncated.length} chars, budget: ${perDocBudget})`
              );
            } else {
              log.info(`[ChatGraph] Doc context loaded: "${d.title}" (${plainText.length} chars)`);
            }
            return `### ${d.title}\n\n${truncated}`;
          });

        if (docParts.length > 0) {
          initialState.documentMentionContext = docParts.join('\n\n---\n\n');
        }
      }
    } catch (err) {
      log.warn(
        `[ChatGraph] Doc mention context failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Index large document attachments via vector pipeline
  const SMALL_DOC_VECTORIZATION_THRESHOLD = 4000;

  const largeDocAttachments = docAttachments.filter((att) => {
    const meta = processedMeta.find((m) => m.name === att.name && !m.isImage);
    const textLength = meta?.extractedText?.length ?? 0;
    return textLength >= SMALL_DOC_VECTORIZATION_THRESHOLD;
  });

  if (largeDocAttachments.length > 0) {
    try {
      const { getPostgresDocumentService } =
        await import('../../../services/document-services/PostgresDocumentService/index.js');
      const { getQdrantDocumentService } =
        await import('../../../services/document-services/DocumentSearchService/index.js');
      const { processFileUpload } =
        await import('../../../services/document-services/DocumentProcessingService/fileProcessing.js');

      const pgService = getPostgresDocumentService();
      const qdrantService = getQdrantDocumentService();

      for (const att of largeDocAttachments) {
        try {
          const buffer = Buffer.from(att.data, 'base64');
          const result = await processFileUpload(
            pgService,
            qdrantService,
            userId,
            {
              buffer,
              mimetype: att.type,
              originalname: att.name,
              size: buffer.length,
            },
            att.name,
            'documentchat'
          );

          initialState.documentChatIds.push(result.id);
          sse.send('document_indexed', {
            documentId: result.id,
            title: result.title,
          });
          log.info(`[ChatGraph] Indexed attachment as document: ${result.title} (${result.id})`);
        } catch (indexErr) {
          log.warn(
            `[ChatGraph] Failed to index attachment "${att.name}": ${indexErr instanceof Error ? indexErr.message : String(indexErr)}`
          );
        }
      }
    } catch (importErr) {
      log.warn(
        `[ChatGraph] Document indexing services unavailable: ${importErr instanceof Error ? importErr.message : String(importErr)}`
      );
    }
  }

  // Clear raw attachment text for vectorized docs only.
  // Small docs (<4K chars) keep their inline attachmentContext.
  if (initialState.documentChatIds && initialState.documentChatIds.length > 0) {
    if (largeDocAttachments.length === docAttachments.length) {
      initialState.attachmentContext = null;
    } else {
      const smallDocNames = new Set(
        docAttachments.filter((att) => !largeDocAttachments.includes(att)).map((att) => att.name)
      );
      const smallDocTexts = processedMeta
        .filter((m) => !m.isImage && m.extractedText && smallDocNames.has(m.name))
        .map((m) => `### ${m.name}\n\n${m.extractedText}`);
      initialState.attachmentContext =
        smallDocTexts.length > 0 ? smallDocTexts.join('\n\n---\n\n') : null;
    }
    log.info(
      `[ChatGraph] Attachment routing: ${largeDocAttachments.length} vectorized (RAG), ${docAttachments.length - largeDocAttachments.length} inline`
    );
  }
}
