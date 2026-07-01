/**
 * Attachment Processing Service
 *
 * Handles processing of chat attachments:
 * - Separates images from documents
 * - Extracts text from documents via OCR
 * - Injects image attachments into AI messages for vision models
 */

import { OCRService } from '../../../services/OcrService/index.js';
import { createLogger } from '../../../utils/logger.js';

import type {
  ProcessedAttachment,
  ImageAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('AttachmentProcessing');

const ocrService = new OCRService();

export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ProcessedAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  extractedText: string | null;
  /** Base64 image bytes, set for images only — used to generate a persistent
   *  vision description (summary) for multi-turn image memory. */
  imageData?: string;
}

/**
 * Process attachments: separate images from documents, extract text from documents.
 */
export async function processAttachments(
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
        imageData: attachment.data,
      });
      log.info(`[${requestId}] Added image attachment: ${attachment.name}`);
    } else {
      try {
        const result = await ocrService.extractTextFromBase64(
          attachment.data,
          attachment.name,
          attachment.type
        );

        if (result.text && result.text.length > 0) {
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

/**
 * Inject image attachments into the last user message for vision model processing.
 */
export function injectImageAttachments(
  messages: ModelMessage[],
  imageAttachments: ImageAttachment[],
  requestId: string
): ModelMessage[] {
  if (imageAttachments.length === 0) return messages;

  log.info(`[${requestId}] Adding ${imageAttachments.length} images to message for vision model`);

  const result = [...messages];
  let lastUserIdx = -1;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx >= 0) {
    const lastUserMsg = result[lastUserIdx];
    const textContent =
      typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg.content)
          ? lastUserMsg.content
              .filter((p: { type: string; text?: string }) => p.type === 'text')
              .map((p: { type: string; text?: string }) => p.text)
              .join('')
          : '';

    const multimodalContent: Array<
      { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
    > = [{ type: 'text' as const, text: textContent }];

    for (const img of imageAttachments) {
      multimodalContent.push({
        type: 'image' as const,
        image: Buffer.from(img.data, 'base64').toString('base64'),
        mimeType: img.type,
      });
    }

    result[lastUserIdx] = {
      role: 'user',
      content: multimodalContent,
    };
  }

  return result;
}
