/**
 * Response Formatter Utility
 *
 * Provides consistent API response formatting across all routes
 * Handles success responses, error responses, and metadata standardization
 */

import { processResponseWithTitle } from '../prompt/index.js';
import type { Response } from 'express';
import type {
  AIWorkerResult,
  AttachmentInfo,
  SuccessResponse,
  ErrorResponse,
  ErrorResponseWithStatus,
} from './types.js';

/**
 * Creates a standardized success response
 */
export function createSuccessResponse(
  result: AIWorkerResult | string,
  routePath: string,
  formData: Record<string, any> = {},
  additionalMetadata: Record<string, any> = {}
): SuccessResponse {
  // Process response with title extraction if it's an AI result
  let processedResult: AIWorkerResult =
    typeof result === 'string' ? { success: true, content: result } : result;

  if (typeof result === 'object' && result.success && result.content) {
    processedResult = processResponseWithTitle(result as AIWorkerResult, routePath, formData);
  }

  // Build base response object
  const response: SuccessResponse = {
    success: true,
    content: processedResult.content || (result as AIWorkerResult).content || String(result),
    metadata: {
      ...processedResult.metadata,
      ...additionalMetadata,
      timestamp: new Date().toISOString(),
    },
  };

  const agent = processedResult.agent || (result as AIWorkerResult).agent || formData.agent;
  if (agent) {
    response.agent = agent;
  }

  return response;
}

/**
 * Creates a standardized success response with attachment and web search source metadata
 */
export function createSuccessResponseWithAttachments(
  result: AIWorkerResult,
  routePath: string,
  formData: Record<string, any>,
  attachmentInfo: AttachmentInfo,
  usePrivacyMode: boolean = false,
  provider: string | null = null
): SuccessResponse {
  // Extract web search sources from result metadata
  const webSearchSources = result?.metadata?.webSearchSources || null;
  const hasWebSearchSources =
    webSearchSources && Array.isArray(webSearchSources) && webSearchSources.length > 0;

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
    enrichmentSummary: enrichmentSummary,
  };

  return createSuccessResponse(result, routePath, formData, attachmentMetadata);
}

/**
 * Creates a standardized error response (secure - no internal details exposed)
 */
export function createErrorResponse(
  userMessage: string,
  statusCode: number = 500,
  errorCode: string | null = null
): ErrorResponseWithStatus {
  const response: ErrorResponse = {
    success: false,
    error: userMessage,
    timestamp: new Date().toISOString(),
  };

  // Add error code for debugging if provided
  if (errorCode) {
    response.code = errorCode;
  }

  return { response, statusCode };
}

/**
 * Sends a success response with consistent logging
 */
export function sendSuccessResponse(
  res: Response,
  result: AIWorkerResult | string,
  routePath: string,
  formData: Record<string, any> = {},
  additionalMetadata: Record<string, any> = {}
): void {
  const response = createSuccessResponse(result, routePath, formData, additionalMetadata);

  // Extract route name for logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');
  console.log(`[${routeName}] Success: ${response.content?.length || 0} chars generated`);

  res.json(response);
}

/**
 * Sends a success response with attachment metadata and consistent logging
 */
export function sendSuccessResponseWithAttachments(
  res: Response,
  result: AIWorkerResult,
  routePath: string,
  formData: Record<string, any>,
  attachmentInfo: AttachmentInfo,
  usePrivacyMode: boolean,
  provider: string | null
): void {
  const response = createSuccessResponseWithAttachments(
    result,
    routePath,
    formData,
    attachmentInfo,
    usePrivacyMode,
    provider
  );

  // Extract route name for logging
  const routeName = routePath.replace('/api/', '').replace('/', '_');

  // Enhanced logging with source information
  const sourcesInfo = response.metadata?.webSearchUsed
    ? ` with ${response.metadata.webSearchSourcesCount} web search sources`
    : '';
  console.log(
    `[${routeName}] Success: ${response.content?.length || 0} chars generated${sourcesInfo}`
  );

  res.json(response);
}

/**
 * Sends an error response with consistent logging (secure)
 */
export function sendErrorResponse(
  res: Response,
  routePath: string,
  error: Error | any,
  userMessage: string,
  statusCode: number = 500
): void {
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
}

export default {
  createSuccessResponse,
  createSuccessResponseWithAttachments,
  createErrorResponse,
  sendSuccessResponse,
  sendSuccessResponseWithAttachments,
  sendErrorResponse,
};
