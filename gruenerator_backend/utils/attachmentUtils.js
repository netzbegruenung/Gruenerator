/**
 * Backend Attachment Utilities
 * 
 * Handles file validation and Claude API message building for attachments
 * with direct upload approach (minimal preprocessing)
 */

// File type validation
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 
  'image/jpg',  // Some clients send this instead of image/jpeg
  'image/png',
  'image/webp'
];

// Attachment type validation (includes both files and crawled URLs)
const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_MIME_TYPES,
  'crawled_url' // New type for crawled content
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB total (Claude API has 32MB limit, leaving buffer)

/**
 * Validates attachments array from frontend
 * @param {Array} attachments - Array of attachment objects from frontend
 * @throws {Error} If validation fails
 * @returns {boolean} True if valid
 */
const validateAttachments = (attachments) => {
  if (!Array.isArray(attachments)) {
    throw new Error('Attachments must be an array');
  }

  if (attachments.length === 0) {
    return true; // Empty is valid
  }

  let totalSize = 0;

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    
    // Check required fields
    if (!attachment.name || typeof attachment.name !== 'string') {
      throw new Error(`Attachment ${i + 1}: Missing or invalid name`);
    }
    
    if (!attachment.type || typeof attachment.type !== 'string') {
      throw new Error(`Attachment ${i + 1}: Missing or invalid type`);
    }
    
    if (!attachment.data || typeof attachment.data !== 'string') {
      throw new Error(`Attachment ${i + 1}: Missing or invalid data`);
    }
    
    if (typeof attachment.size !== 'number' || attachment.size <= 0) {
      throw new Error(`Attachment ${i + 1}: Missing or invalid size`);
    }

    // Validate attachment type (including crawled URLs)
    if (!ALLOWED_ATTACHMENT_TYPES.includes(attachment.type)) {
      throw new Error(`Attachment ${i + 1}: Unsupported file type '${attachment.type}'. Allowed: ${ALLOWED_ATTACHMENT_TYPES.join(', ')}`);
    }

    // Handle different validation for crawled URLs vs files
    if (attachment.type === 'crawled_url') {
      // Crawled URLs have content instead of base64 data
      if (!attachment.content || typeof attachment.content !== 'string') {
        throw new Error(`Attachment ${i + 1}: Missing or invalid content for crawled URL`);
      }
      
      if (!attachment.url || typeof attachment.url !== 'string') {
        throw new Error(`Attachment ${i + 1}: Missing or invalid URL for crawled URL`);
      }

      // Use content length as size for crawled URLs (character count)
      const contentSize = attachment.content.length;
      if (contentSize > MAX_FILE_SIZE) {
        const sizeMB = Math.round(contentSize / (1024 * 1024));
        const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
        throw new Error(`Attachment ${i + 1}: Crawled content too large (${sizeMB}MB). Maximum: ${maxSizeMB}MB`);
      }
      
      totalSize += contentSize;
    } else {
      // Regular file validation
      // Validate file size
      if (attachment.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(attachment.size / (1024 * 1024));
        const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
        throw new Error(`Attachment ${i + 1}: File too large (${sizeMB}MB). Maximum: ${maxSizeMB}MB`);
      }

      // Validate base64 data format
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.data)) {
        throw new Error(`Attachment ${i + 1}: Invalid base64 data format`);
      }
      
      totalSize += attachment.size;
    }
  }

  // Check total size
  if (totalSize > MAX_TOTAL_SIZE) {
    const totalSizeMB = Math.round(totalSize / (1024 * 1024));
    const maxTotalSizeMB = Math.round(MAX_TOTAL_SIZE / (1024 * 1024));
    throw new Error(`Total attachment size too large (${totalSizeMB}MB). Maximum: ${maxTotalSizeMB}MB`);
  }

  return true;
};

/**
 * Builds Claude API content blocks from attachments and text content
 * @param {Array} attachments - Array of validated attachment objects
 * @param {string} textContent - Main text content for the user message
 * @returns {Array} Array of message objects for Claude API
 */
const buildMessagesWithAttachments = (attachments, textContent) => {
  const contentBlocks = [];

  // Add attachment blocks first (Claude processes documents before text)
  if (attachments && attachments.length > 0) {
    console.log(`[buildMessagesWithAttachments] Processing ${attachments.length} attachments`);
    
    attachments.forEach((file, index) => {
      console.log(`[buildMessagesWithAttachments] Adding attachment ${index + 1}: ${file.name} (${file.type})`);
      
      if (file.type === 'crawled_url') {
        // Handle crawled URL content as text block
        console.log(`[buildMessagesWithAttachments] Processing crawled URL: ${file.url} (${file.content?.length || 0} chars)`);
        contentBlocks.push({
          type: "text",
          text: `[Inhalt von ${file.displayUrl || file.url}]\n\n${file.content}`
        });
      } else if (file.type === 'application/pdf') {
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: file.type,
            data: file.data
          }
        });
      } else if (file.type.startsWith('image/')) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type,
            data: file.data
          }
        });
      } else {
        console.warn(`[buildMessagesWithAttachments] Skipping unsupported file type: ${file.type}`);
      }
    });
  }

  // Add text content last
  if (textContent && textContent.trim()) {
    contentBlocks.push({
      type: "text",
      text: textContent  // Fixed: use "text" property instead of "content" for Bedrock compatibility
    });
  } else {
    // Even if no text content, we need at least one text block for Claude API
    contentBlocks.push({
      type: "text",
      text: "Please analyze the attached files."  // Fixed: use "text" property instead of "content"
    });
  }

  return [{
    role: "user",
    content: contentBlocks
  }];
};

/**
 * Enhances system prompt with attachment-aware instructions
 * @param {string} baseSystemPrompt - Original system prompt
 * @param {boolean} hasAttachments - Whether attachments are present
 * @returns {string} Enhanced system prompt
 */
const enhanceSystemPromptWithAttachments = (baseSystemPrompt, hasAttachments) => {
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
};

/**
 * Creates a summary of attachments for logging
 * @param {Array} attachments - Array of attachment objects
 * @returns {Object} Summary object
 */
const createAttachmentsSummary = (attachments) => {
  if (!attachments || attachments.length === 0) {
    return {
      count: 0,
      totalSizeMB: 0,
      types: []
    };
  }

  const totalSize = attachments.reduce((sum, file) => sum + file.size, 0);
  const types = [...new Set(attachments.map(file => file.type))];

  return {
    count: attachments.length,
    totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
    types,
    files: attachments.map(file => ({
      name: file.name,
      type: file.type,
      sizeMB: Math.round(file.size / (1024 * 1024) * 100) / 100
    }))
  };
};

/**
 * Checks if attachments are present and valid
 * @param {Array} attachments - Attachments array from request
 * @returns {boolean} True if attachments are present and have content
 */
const hasValidAttachments = (attachments) => {
  return Array.isArray(attachments) && 
         attachments.length > 0 && 
         attachments.some(att => att && att.data && att.data.trim().length > 0);
};

/**
 * All-in-one attachment processing for routes
 * Combines validation, summary creation, and logging
 * @param {Array} attachments - Attachments from request
 * @param {boolean} usePrivacyMode - Whether privacy mode is enabled
 * @param {string} routeName - Route name for logging context
 * @param {string} userId - User ID for logging (optional)
 * @returns {Object} Processing result with hasAttachments, summary, and validation status
 */
const processAttachmentsForRoute = (attachments, usePrivacyMode, routeName, userId = 'unknown') => {
  const result = {
    hasAttachments: false,
    summary: null,
    validated: false,
    error: null
  };

  // Check if attachments are present
  if (!hasValidAttachments(attachments)) {
    return result;
  }

  try {
    // Validate attachments
    validateAttachments(attachments);
    result.validated = true;
    result.hasAttachments = true;
    
    // Create summary
    result.summary = createAttachmentsSummary(attachments);
    
    // Enhanced logging with context
    logAttachmentProcessing(result.summary, routeName, userId, usePrivacyMode);
    
  } catch (error) {
    result.error = error.message;
    console.error(`[${routeName}] Attachment validation failed for user ${userId}:`, error.message);
  }

  return result;
};

/**
 * Creates documents array for PromptBuilder.addDocuments()
 * @param {Array} attachments - Validated attachment objects
 * @param {boolean} usePrivacyMode - Whether privacy mode is enabled
 * @returns {Array} Documents array formatted for PromptBuilder
 */
const buildDocumentsForPromptBuilder = (attachments, usePrivacyMode = false) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  return attachments.map(att => {
    if (att.type === 'crawled_url') {
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
            crawledAt: att.metadata?.extractedAt
          }
        }
      };
    } else {
      // Handle regular file attachments
      return {
        type: att.type === 'application/pdf' ? 'document' : 'image',
        source: {
          type: 'base64',
          media_type: att.type,
          data: att.data
        }
      };
    }
  });
};

/**
 * Enhanced logging for attachment processing with route context
 * @param {Object} summary - Attachment summary object
 * @param {string} routeName - Route name for logging
 * @param {string} userId - User ID for logging
 * @param {boolean} usePrivacyMode - Privacy mode status
 */
const logAttachmentProcessing = (summary, routeName, userId, usePrivacyMode = false) => {
  if (!summary || summary.count === 0) return;

  const privacyNote = usePrivacyMode ? ' (privacy mode)' : '';
  console.log(`[${routeName}] User ${userId}: Processing ${summary.count} attachments` + 
              ` (${summary.totalSizeMB}MB total)${privacyNote}`);
  
  // Log individual files for debugging
  summary.files.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.name} (${file.type}, ${file.sizeMB}MB)`);
  });
};

/**
 * Comprehensive attachment processing for routes that need everything
 * Combines processAttachmentsForRoute with document building
 * @param {Array} attachments - Attachments from request
 * @param {boolean} usePrivacyMode - Whether privacy mode is enabled
 * @param {string} routeName - Route name for logging
 * @param {string} userId - User ID for logging (optional)
 * @returns {Object} Complete processing result with documents array
 */
const processAndBuildAttachments = async (attachments, usePrivacyMode, routeName, userId = 'unknown') => {
  // First process and validate
  const processResult = processAttachmentsForRoute(attachments, usePrivacyMode, routeName, userId);
  
  // If processing failed or no attachments, return early
  if (!processResult.hasAttachments || processResult.error) {
    return {
      ...processResult,
      documents: []
    };
  }
  
  // Build documents array for PromptBuilder
  const documents = buildDocumentsForPromptBuilder(attachments, usePrivacyMode);
  
  return {
    ...processResult,
    documents
  };
};

module.exports = {
  validateAttachments,
  buildMessagesWithAttachments,
  enhanceSystemPromptWithAttachments,
  createAttachmentsSummary,
  hasValidAttachments,
  // New consolidated functions
  processAttachmentsForRoute,
  buildDocumentsForPromptBuilder,
  logAttachmentProcessing,
  processAndBuildAttachments,
  // Export constants for use in other modules
  ALLOWED_MIME_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE
};