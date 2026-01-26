/**
 * Response Parser
 * Parses various API response formats into a consistent structure.
 */

import type { GeneratorResponse, GeneratorResult } from '../types.js';

/**
 * Parses various API response formats into a consistent GeneratorResult.
 *
 * Handles multiple response formats from the backend:
 * - Direct string response
 * - { content: string, metadata?: object } format
 * - { social: { content: string } } format (claude_social endpoint)
 * - Nested { data: { content: string } } format
 * - Axios wrapper { data: ... } format
 *
 * @param response - The raw API response (can be axios response or direct data)
 * @returns GeneratorResult with success status and parsed content
 */
export function parseGeneratorResponse(response: unknown): GeneratorResult {
  // Handle axios response wrapper (response.data)
  const data = (response as { data?: unknown })?.data ?? response;

  // Direct string response
  if (typeof data === 'string') {
    return {
      success: true,
      data: { content: data, metadata: {} },
    };
  }

  // Object response - try various formats
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Standard { content, metadata } format
    if (typeof obj.content === 'string') {
      return {
        success: true,
        data: {
          content: obj.content,
          metadata: (obj.metadata as GeneratorResponse['metadata']) ?? {},
        },
      };
    }

    // Alt-Text format { altText, metadata } from claude_alttext endpoint
    if (typeof obj.altText === 'string') {
      return {
        success: true,
        data: {
          content: obj.altText,
          metadata: (obj.metadata as GeneratorResponse['metadata']) ?? {},
        },
      };
    }

    // Social format { social: { content } } from claude_social endpoint
    if (obj.social && typeof obj.social === 'object') {
      const social = obj.social as Record<string, unknown>;
      if (typeof social.content === 'string') {
        return {
          success: true,
          data: {
            content: social.content,
            metadata: {},
          },
        };
      }
    }

    // Nested data format { data: { content } }
    if (obj.data && typeof obj.data === 'object') {
      const nestedData = obj.data as Record<string, unknown>;
      if (typeof nestedData.content === 'string') {
        return {
          success: true,
          data: {
            content: nestedData.content,
            metadata: (nestedData.metadata as GeneratorResponse['metadata']) ?? {},
          },
        };
      }
    }

    // Legacy format where entire object might be the content
    if (obj.text && typeof obj.text === 'string') {
      return {
        success: true,
        data: { content: obj.text, metadata: {} },
      };
    }
  }

  // Could not parse response
  return {
    success: false,
    error: 'Keine Antwort erhalten',
  };
}

/**
 * Extracts just the content string from a response.
 * Convenience function for simple use cases.
 *
 * @param response - The raw API response
 * @returns The content string or null if parsing failed
 */
export function extractContent(response: unknown): string | null {
  const result = parseGeneratorResponse(response);
  return result.success ? (result.data?.content ?? null) : null;
}
