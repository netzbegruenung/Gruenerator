/**
 * Core attachment processing service
 * Handles validation, message building, and processing for Claude API
 */

import type {
  Attachment,
  FileAttachment,
  CrawledUrlAttachment,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeDocument,
  AttachmentSummary,
  AttachmentProcessingResult,
} from './types.js';
import {
  validateAttachmentStructure,
  isFileAttachment,
  isCrawledUrlAttachment,
} from './validation.js';
import { ALLOWED_ATTACHMENT_TYPES, MAX_FILE_SIZE, MAX_TOTAL_SIZE } from './constants.js';

/**
 * AttachmentProcessor class
 * Provides validation, message building, and processing for attachments
 */
export class AttachmentProcessor {
  /**
   * Validates attachments array from frontend
   * @param attachments - Array of attachment objects from frontend
   * @throws {Error} If validation fails
   * @returns True if valid (type guard)
   */
  validateAttachments(attachments: unknown[]): attachments is Attachment[] {
    if (!Array.isArray(attachments)) {
      throw new Error('Attachments must be an array');
    }

    if (attachments.length === 0) {
      return true; // Empty is valid
    }

    let totalSize = 0;

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];

      // Validate structure (throws on error, asserts type)
      validateAttachmentStructure(attachment, i);

      // Calculate total size
      if (attachment.type === 'crawled_url') {
        totalSize += attachment.content.length;
      } else {
        totalSize += attachment.size;
      }
    }

    // Check total size
    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = Math.round(totalSize / (1024 * 1024));
      const maxTotalSizeMB = Math.round(MAX_TOTAL_SIZE / (1024 * 1024));
      throw new Error(
        `Total attachment size too large (${totalSizeMB}MB). Maximum: ${maxTotalSizeMB}MB`
      );
    }

    return true;
  }

  /**
   * Builds Claude API content blocks from attachments and text content
   * @param attachments - Array of validated attachment objects
   * @param textContent - Main text content for the user message
   * @returns Array of message objects for Claude API
   */
  buildMessagesWithAttachments(
    attachments: Attachment[] | undefined,
    textContent: string
  ): ClaudeMessage[] {
    const contentBlocks: ClaudeContentBlock[] = [];

    // Add attachment blocks first (Claude processes documents before text)
    if (attachments && attachments.length > 0) {
      console.log(`[buildMessagesWithAttachments] Processing ${attachments.length} attachments`);

      attachments.forEach((file, index) => {
        console.log(
          `[buildMessagesWithAttachments] Adding attachment ${index + 1}: ${file.name} (${file.type})`
        );

        if (isCrawledUrlAttachment(file)) {
          // Handle crawled URL content as text block
          console.log(
            `[buildMessagesWithAttachments] Processing crawled URL: ${file.url} (${file.content?.length || 0} chars)`
          );
          contentBlocks.push({
            type: 'text',
            text: `[Inhalt von ${file.displayUrl || file.url}]\n\n${file.content}`,
          });
        } else if (file.type === 'application/pdf') {
          contentBlocks.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: file.type,
              data: file.data,
            },
          });
        } else if (file.type.startsWith('image/')) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
              data: file.data,
            },
          });
        } else {
          console.warn(
            `[buildMessagesWithAttachments] Skipping unsupported file type: ${file.type}`
          );
        }
      });
    }

    // Add text content last
    if (textContent && textContent.trim()) {
      contentBlocks.push({
        type: 'text',
        text: textContent,
      });
    } else {
      // Even if no text content, we need at least one text block for Claude API
      contentBlocks.push({
        type: 'text',
        text: 'Please analyze the attached files.',
      });
    }

    return [
      {
        role: 'user',
        content: contentBlocks,
      },
    ];
  }

  /**
   * Enhances system prompt with attachment-aware instructions
   * @param baseSystemPrompt - Original system prompt
   * @param hasAttachments - Whether attachments are present
   * @returns Enhanced system prompt
   */
  enhanceSystemPromptWithAttachments(baseSystemPrompt: string, hasAttachments: boolean): string {
    if (!hasAttachments) {
      return baseSystemPrompt;
    }

    const attachmentInstructions = `

Du hast Zugang zu beigefügten Dokumenten und Bildern. Nutze diese als Kontext und Referenz für deine Antwort:
- Analysiere den Inhalt der Dokumente sorgfältig
- Beziehe relevante Informationen in deine Erstellung mit ein
- Wenn du Inhalte aus den Dokumenten verwendest, weise darauf hin
- Die Dokumente dienen als Hintergrundinformation und Kontext für deine Aufgabe`;

    return baseSystemPrompt + attachmentInstructions;
  }

  /**
   * Creates a summary of attachments for logging
   * @param attachments - Array of attachment objects
   * @returns Summary object
   */
  createAttachmentsSummary(attachments: Attachment[]): AttachmentSummary {
    if (!attachments || attachments.length === 0) {
      return {
        count: 0,
        totalSizeMB: 0,
        types: [],
        files: [],
      };
    }

    const totalSize = attachments.reduce((sum, file) => sum + file.size, 0);
    const types = Array.from(new Set(attachments.map((file) => file.type)));

    return {
      count: attachments.length,
      totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      types,
      files: attachments.map((file) => ({
        name: file.name,
        type: file.type,
        sizeMB: Math.round((file.size / (1024 * 1024)) * 100) / 100,
      })),
    };
  }

  /**
   * Checks if attachments are present and valid
   * @param attachments - Attachments array from request
   * @returns True if attachments are present and have content
   */
  hasValidAttachments(attachments: unknown): attachments is Attachment[] {
    return (
      Array.isArray(attachments) &&
      attachments.length > 0 &&
      attachments.some((att) => att && att.data && att.data.trim().length > 0)
    );
  }

  /**
   * All-in-one attachment processing for routes
   * Combines validation, summary creation, and logging
   * @param attachments - Attachments from request
   * @param usePrivacyMode - Whether privacy mode is enabled
   * @param routeName - Route name for logging context
   * @param userId - User ID for logging (optional)
   * @returns Processing result with hasAttachments, summary, and validation status
   */
  processAttachmentsForRoute(
    attachments: unknown,
    usePrivacyMode: boolean,
    routeName: string,
    userId: string = 'unknown'
  ): {
    hasAttachments: boolean;
    summary: AttachmentSummary | null;
    validated: boolean;
    error: string | null;
  } {
    const result: {
      hasAttachments: boolean;
      summary: AttachmentSummary | null;
      validated: boolean;
      error: string | null;
    } = {
      hasAttachments: false,
      summary: null,
      validated: false,
      error: null,
    };

    // Check if attachments are present
    if (!this.hasValidAttachments(attachments)) {
      return result;
    }

    try {
      // Validate attachments
      this.validateAttachments(attachments);
      result.validated = true;
      result.hasAttachments = true;

      // Create summary
      result.summary = this.createAttachmentsSummary(attachments);

      // Enhanced logging with context
      this.logAttachmentProcessing(result.summary, routeName, userId, usePrivacyMode);
    } catch (error) {
      result.error = (error as Error).message;
      console.error(
        `[${routeName}] Attachment validation failed for user ${userId}:`,
        (error as Error).message
      );
    }

    return result;
  }

  /**
   * Creates documents array for PromptBuilder.addDocuments()
   * @param attachments - Validated attachment objects
   * @param usePrivacyMode - Whether privacy mode is enabled
   * @returns Documents array formatted for PromptBuilder
   */
  buildDocumentsForPromptBuilder(
    attachments: Attachment[],
    usePrivacyMode: boolean = false
  ): ClaudeDocument[] {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [];
    }

    return attachments.map((att) => {
      if (isCrawledUrlAttachment(att)) {
        // Handle crawled URL as text document
        return {
          type: 'text',
          source: {
            type: 'text',
            text: `[Inhalt von ${att.displayUrl || att.url}]\n\n${att.content}`,
            metadata: {
              url: att.url,
              name: att.name,
              wordCount: att.metadata?.wordCount,
              crawledAt: att.metadata?.extractedAt,
            },
          },
        };
      } else {
        // Handle regular file attachments
        return {
          type: att.type === 'application/pdf' ? 'document' : 'image',
          source: {
            type: 'base64',
            media_type: att.type,
            data: att.data,
          },
        };
      }
    });
  }

  /**
   * Enhanced logging for attachment processing with route context
   * @param summary - Attachment summary object
   * @param routeName - Route name for logging
   * @param userId - User ID for logging
   * @param usePrivacyMode - Privacy mode status
   */
  logAttachmentProcessing(
    summary: AttachmentSummary,
    routeName: string,
    userId: string,
    usePrivacyMode: boolean = false
  ): void {
    if (!summary || summary.count === 0) return;

    const privacyNote = usePrivacyMode ? ' (privacy mode)' : '';
    console.log(
      `[${routeName}] User ${userId}: Processing ${summary.count} attachments` +
        ` (${summary.totalSizeMB}MB total)${privacyNote}`
    );

    // Log individual files for debugging
    summary.files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} (${file.type}, ${file.sizeMB}MB)`);
    });
  }

  /**
   * Comprehensive attachment processing for routes that need everything
   * Combines processAttachmentsForRoute with document building
   * @param attachments - Attachments from request
   * @param usePrivacyMode - Whether privacy mode is enabled
   * @param routeName - Route name for logging
   * @param userId - User ID for logging (optional)
   * @returns Complete processing result with documents array
   */
  async processAndBuildAttachments(
    attachments: unknown,
    usePrivacyMode: boolean,
    routeName: string,
    userId: string = 'unknown'
  ): Promise<AttachmentProcessingResult> {
    // First process and validate
    const processResult = this.processAttachmentsForRoute(
      attachments,
      usePrivacyMode,
      routeName,
      userId
    );

    // If processing failed or no attachments, return early
    if (!processResult.hasAttachments || processResult.error) {
      return {
        ...processResult,
        documents: [],
      };
    }

    // Build documents array for PromptBuilder
    const documents = this.buildDocumentsForPromptBuilder(
      attachments as Attachment[],
      usePrivacyMode
    );

    return {
      ...processResult,
      documents,
    };
  }
}

// Export singleton instance
export const attachmentProcessor = new AttachmentProcessor();

// Export named functions for backward compatibility
export const validateAttachments = (attachments: unknown[]) =>
  attachmentProcessor.validateAttachments(attachments);

export const buildMessagesWithAttachments = (
  attachments: Attachment[] | undefined,
  textContent: string
) => attachmentProcessor.buildMessagesWithAttachments(attachments, textContent);

export const enhanceSystemPromptWithAttachments = (
  baseSystemPrompt: string,
  hasAttachments: boolean
) => attachmentProcessor.enhanceSystemPromptWithAttachments(baseSystemPrompt, hasAttachments);

export const createAttachmentsSummary = (attachments: Attachment[]) =>
  attachmentProcessor.createAttachmentsSummary(attachments);

export const hasValidAttachments = (attachments: unknown) =>
  attachmentProcessor.hasValidAttachments(attachments);

export const processAttachmentsForRoute = (
  attachments: unknown,
  usePrivacyMode: boolean,
  routeName: string,
  userId?: string
) => attachmentProcessor.processAttachmentsForRoute(attachments, usePrivacyMode, routeName, userId);

export const buildDocumentsForPromptBuilder = (
  attachments: Attachment[],
  usePrivacyMode?: boolean
) => attachmentProcessor.buildDocumentsForPromptBuilder(attachments, usePrivacyMode);

export const logAttachmentProcessing = (
  summary: AttachmentSummary,
  routeName: string,
  userId: string,
  usePrivacyMode?: boolean
) => attachmentProcessor.logAttachmentProcessing(summary, routeName, userId, usePrivacyMode);

export const processAndBuildAttachments = (
  attachments: unknown,
  usePrivacyMode: boolean,
  routeName: string,
  userId?: string
) => attachmentProcessor.processAndBuildAttachments(attachments, usePrivacyMode, routeName, userId);
