/**
 * Response Formatter Utility
 * 
 * Provides consistent API response formatting across all routes
 * Handles success responses, error responses, and metadata standardization
 */

import { processResponseWithTitle } from './promptUtils.js';

/**
 * Creates a standardized success response
 * @param {Object} result - AI worker result or raw content
 * @param {string} routePath - Route path for content type detection
 * @param {Object} formData - Original form data
 * @param {Object} additionalMetadata - Additional metadata to include
 * @returns {Object} Formatted success response
 */
const createSuccessResponse = (result, routePath, formData = {}, additionalMetadata = {}) => {
  // Process response with title extraction if it's an AI result
  let processedResult = result;
  if (result && result.success && result.content) {
    processedResult = processResponseWithTitle(result, routePath, formData);
  }

  // Build base response object
  const response = {
    success: true,
    content: processedResult.content || result.content || result,
    metadata: {
      ...processedResult.metadata,
      ...additionalMetadata,
      timestamp: new Date().toISOString()
    }
  };

  const agent = processedResult.agent || result.agent || formData.agent;
  if (agent) {
    response.agent = agent;
  }

  return response;
};

/**
 * Creates a standardized success response with attachment and web search source metadata
 * @param {Object} result - AI worker result (may include webSearchSources in metadata)
 * @param {string} routePath - Route path for content type detection
 * @param {Object} formData - Original form data
 * @param {Object} attachmentInfo - Attachment processing information
 * @param {boolean} usePrivacyMode - Whether privacy mode was used
 * @param {string} provider - AI provider used (if privacy mode)
 * @returns {Object} Formatted success response with attachment and source metadata
 */
const createSuccessResponseWithAttachments = (result, routePath, formData, attachmentInfo, usePrivacyMode = false, provider = null) => {
  // Extract web search sources from result metadata
  const webSearchSources = result?.metadata?.webSearchSources || null;
  const hasWebSearchSources = webSearchSources && Array.isArray(webSearchSources) && webSearchSources.length > 0;

  // Extract enrichment summary (includes sources and auto-selected documents)
  const enrichmentSummary = attachmentInfo.enrichmentSummary || null;

  const attachmentMetadata = {
    privacyModeUsed: usePrivacyMode,
    provider: usePrivacyMode && provider ? provider : 'default',
    attachmentsUsed: attachmentInfo.hasAttachments,
    attachmentsCount: attachmentInfo.summary?.count || 0,
    attachmentsTotalSizeMB: attachmentInfo.summary?.totalSizeMB || 0,
    // Add web search source information
    webSearchUsed: hasWebSearchSources,
    webSearchSourcesCount: hasWebSearchSources ? webSearchSources.length : 0,
    // Preserve sources for frontend display
    webSearchSources: webSearchSources,
    // Add enrichment summary (includes all source types including auto-selected documents)
    enrichmentSummary: enrichmentSummary
  };

  return createSuccessResponse(result, routePath, formData, attachmentMetadata);
};

/**
 * Creates a standardized error response (secure - no internal details exposed)
 * @param {string} userMessage - User-friendly error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} errorCode - Internal error code for debugging (optional)
 * @returns {Object} Formatted error response
 */
const createErrorResponse = (userMessage, statusCode = 500, errorCode = null) => {
  const response = {
    success: false,
    error: userMessage,
    timestamp: new Date().toISOString()
  };

  // Add error code for debugging if provided
  if (errorCode) {
    response.code = errorCode;
  }

  return { response, statusCode };
};

/**
 * Sends a success response with consistent logging
 * @param {Object} res - Express response object
 * @param {Object} result - AI worker result
 * @param {string} routePath - Route path for logging
 * @param {Object} formData - Original form data
 * @param {Object} additionalMetadata - Additional metadata
 */
const sendSuccessResponse = (res, result, routePath, formData, additionalMetadata = {}) => {
  const response = createSuccessResponse(result, routePath, formData, additionalMetadata);
  
  // Extract route name for logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  console.log(`[${routeName}] Success: ${response.content?.length || 0} chars generated`);
  
  res.json(response);
};

/**
 * Sends a success response with attachment metadata and consistent logging
 * @param {Object} res - Express response object
 * @param {Object} result - AI worker result
 * @param {string} routePath - Route path for logging
 * @param {Object} formData - Original form data
 * @param {Object} attachmentInfo - Attachment processing information
 * @param {boolean} usePrivacyMode - Whether privacy mode was used
 * @param {string} provider - AI provider used
 */
const sendSuccessResponseWithAttachments = (res, result, routePath, formData, attachmentInfo, usePrivacyMode, provider) => {
  const response = createSuccessResponseWithAttachments(result, routePath, formData, attachmentInfo, usePrivacyMode, provider);
  
  // Extract route name for logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  
  // Enhanced logging with source information
  const sourcesInfo = response.metadata?.webSearchUsed ? ` with ${response.metadata.webSearchSourcesCount} web search sources` : '';
  console.log(`[${routeName}] Success: ${response.content?.length || 0} chars generated${sourcesInfo}`);
  
  res.json(response);
};

/**
 * Sends an error response with consistent logging (secure)
 * @param {Object} res - Express response object
 * @param {string} routePath - Route path for logging
 * @param {Error} error - Original error object (for logging only)
 * @param {string} userMessage - User-friendly message
 * @param {number} statusCode - HTTP status code
 */
const sendErrorResponse = (res, routePath, error, userMessage, statusCode = 500) => {
  // Extract route name for logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  
  // Log detailed error for debugging (server-side only)
  console.error(`[${routeName}] Error:`, error.message || error);
  if (error.stack) {
    console.error(`[${routeName}] Stack trace:`, error.stack);
  }
  
  // Create secure response (no internal details)
  const { response, statusCode: finalStatusCode } = createErrorResponse(userMessage, statusCode);
  
  res.status(finalStatusCode).json(response);
};

export { createSuccessResponse, createSuccessResponseWithAttachments, createErrorResponse, sendSuccessResponse, sendSuccessResponseWithAttachments, sendErrorResponse };