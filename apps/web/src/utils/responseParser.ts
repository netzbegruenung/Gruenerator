/**
 * Response Parser Utility
 *
 * Replaces the 76-line switch statement in useApiSubmit.ts with a clean
 * strategy pattern using endpoint categories and parser functions.
 *
 * This approach makes it trivial to add new endpoints - just add to the
 * ENDPOINT_CATEGORIES mapping.
 */

import type { ParsedResponse } from '../hooks/useGeneratorResponse';

/**
 * Endpoint category types
 * Each category has its own parser strategy
 */
export type EndpointCategory =
  | 'claude-text' // Standard Claude text generation endpoints
  | 'claude-search' // Search query endpoints
  | 'claude-structured' // Endpoints returning structured data (dreizeilen, info, headline)
  | 'etherpad' // Etherpad document creation
  | 'docs' // Document management
  | 'analyze' // Analysis endpoints
  | 'custom-generator' // Custom generator endpoints
  | 'subtitles' // Subtitle correction
  | 'text-adjustment' // Text adjustment suggestions
  | 'think' // Claude think responses
  | 'ask' // Gruenerator ask responses
  | 'alt-text' // Alt text generation
  | 'generator-config' // Generator configuration
  | 'fallback'; // Generic fallback

/**
 * Parser strategy interface
 * Each category implements validation and extraction logic
 * @template T The validated response type
 */
export interface EndpointParser<T = Record<string, unknown>> {
  /**
   * Type predicate to validate response structure
   * @param response - Response to validate
   * @returns True if response matches expected structure
   */
  validate: (response: unknown) => response is T;

  /**
   * Extracts content and metadata from validated response
   * @param response - Validated response
   * @returns Extracted content and metadata
   */
  extract: (response: T) => {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Response type definitions for each endpoint category
 */
interface ClaudeTextResponse {
  content: string;
  metadata?: unknown;
}

interface EtherpadResponse {
  padURL: string;
}

interface DocumentResponse {
  documentId: string;
}

interface AnalysisResponse {
  status: string;
  analysis: unknown;
  sourceRecommendations?: unknown[];
  claudeSourceTitles?: unknown[];
}

interface CustomGeneratorResponse {
  content: string;
}

interface SubtitlesResponse {
  hasCorrections: boolean;
  [key: string]: unknown;
}

interface TextAdjustmentResponse {
  suggestions: unknown[];
}

interface ThinkResponse {
  response: string;
}

interface AskResponse {
  answer: string;
  [key: string]: unknown;
}

interface AltTextResponse {
  altText: string;
  [key: string]: unknown;
}

interface GeneratorConfigResponse {
  name: string;
  slug: string;
  fields: Array<{
    label: string;
    name: string;
    type: string;
    required: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
  prompt: string;
}

/**
 * Parser strategies by category
 * Each implements validate() and extract() methods
 */
const RESPONSE_PARSERS = {
  /**
   * Claude text generation endpoints
   * Format: { content: string, metadata?: object }
   */
  'claude-text': {
    validate: (response: unknown): response is ClaudeTextResponse =>
      typeof response === 'object' &&
      response !== null &&
      'content' in response &&
      typeof (response as Record<string, unknown>).content === 'string',
    extract: (response: ClaudeTextResponse) => ({
      content: response.content,
      metadata:
        response.metadata && typeof response.metadata === 'object'
          ? (response.metadata as Record<string, unknown>)
          : undefined,
    }),
  },

  /**
   * Search query endpoints
   * Format: { content: string } or { results: array }
   */
  'claude-search': {
    validate: (response: unknown): response is Record<string, unknown> =>
      typeof response === 'object' &&
      response !== null &&
      ('content' in response || 'results' in response),
    extract: (response: Record<string, unknown>) => ({
      content: JSON.stringify(response),
      metadata: response,
    }),
  },

  /**
   * Structured response endpoints (dreizeilen, info, headline)
   * Format varies by endpoint but contains structured data
   */
  'claude-structured': {
    validate: (response: unknown): response is Record<string, unknown> =>
      typeof response === 'object' &&
      response !== null &&
      (('mainSlogan' in response &&
        'alternatives' in response &&
        Array.isArray((response as Record<string, unknown>).alternatives)) ||
        ('mainInfo' in response && 'alternatives' in response) ||
        'mainSimple' in response ||
        'mainEvent' in response ||
        'quote' in response),
    extract: (response: Record<string, unknown>) => ({
      content: JSON.stringify(response),
      metadata: response,
    }),
  },

  /**
   * Etherpad document creation
   * Format: { padURL: string }
   */
  etherpad: {
    validate: (response: unknown): response is EtherpadResponse =>
      typeof response === 'object' &&
      response !== null &&
      'padURL' in response &&
      typeof (response as Record<string, unknown>).padURL === 'string',
    extract: (response: EtherpadResponse) => ({
      content: response.padURL,
      metadata: { padURL: response.padURL },
    }),
  },

  /**
   * Document management endpoints
   * Format: { documentId: string }
   */
  docs: {
    validate: (response: unknown): response is DocumentResponse =>
      typeof response === 'object' &&
      response !== null &&
      'documentId' in response &&
      typeof (response as Record<string, unknown>).documentId === 'string',
    extract: (response: DocumentResponse) => ({
      content: response.documentId,
      metadata: { documentId: response.documentId },
    }),
  },

  /**
   * Analysis endpoints
   * Format: { status: 'success', analysis: object }
   */
  analyze: {
    validate: (response: unknown): response is AnalysisResponse =>
      typeof response === 'object' &&
      response !== null &&
      'status' in response &&
      (response as Record<string, unknown>).status === 'success' &&
      'analysis' in response,
    extract: (response: AnalysisResponse) => ({
      content: JSON.stringify(response.analysis),
      metadata: response as unknown as Record<string, unknown>,
    }),
  },

  /**
   * Custom generator endpoints
   * Format: { content: string }
   */
  'custom-generator': {
    validate: (response: unknown): response is CustomGeneratorResponse =>
      typeof response === 'object' &&
      response !== null &&
      'content' in response &&
      typeof (response as Record<string, unknown>).content === 'string',
    extract: (response: CustomGeneratorResponse) => ({
      content: response.content,
      metadata: undefined,
    }),
  },

  /**
   * Subtitle correction endpoints
   * Format: { hasCorrections: boolean, ... }
   */
  subtitles: {
    validate: (response: unknown): response is SubtitlesResponse =>
      typeof response === 'object' &&
      response !== null &&
      'hasCorrections' in response &&
      typeof (response as Record<string, unknown>).hasCorrections === 'boolean',
    extract: (response: SubtitlesResponse) => ({
      content: JSON.stringify(response),
      metadata: response,
    }),
  },

  /**
   * Text adjustment suggestions endpoints
   * Format: { suggestions: array }
   */
  'text-adjustment': {
    validate: (response: unknown): response is TextAdjustmentResponse => {
      if (typeof response !== 'object' || response === null || !('suggestions' in response)) {
        return false;
      }
      const suggestions = (response as Record<string, unknown>).suggestions;
      return Array.isArray(suggestions) && suggestions.length > 0;
    },
    extract: (response: TextAdjustmentResponse) => ({
      content:
        typeof response.suggestions[0] === 'string'
          ? response.suggestions[0]
          : JSON.stringify(response.suggestions[0]),
      metadata: { suggestions: response.suggestions },
    }),
  },

  /**
   * Claude think endpoints
   * Format: { response: string }
   */
  think: {
    validate: (response: unknown): response is ThinkResponse =>
      typeof response === 'object' &&
      response !== null &&
      'response' in response &&
      typeof (response as Record<string, unknown>).response === 'string',
    extract: (response: ThinkResponse) => ({
      content: response.response,
      metadata: response as unknown as Record<string, unknown>,
    }),
  },

  /**
   * Gruenerator ask endpoints
   * Format: { answer: string, sources?: array, ... }
   */
  ask: {
    validate: (response: unknown): response is AskResponse =>
      typeof response === 'object' &&
      response !== null &&
      'answer' in response &&
      typeof (response as Record<string, unknown>).answer === 'string',
    extract: (response: AskResponse) => ({
      content: response.answer,
      metadata: response as Record<string, unknown>,
    }),
  },

  /**
   * Alt text generation endpoints
   * Format: { altText: string, metadata?: object }
   */
  'alt-text': {
    validate: (response: unknown): response is AltTextResponse =>
      typeof response === 'object' &&
      response !== null &&
      'altText' in response &&
      typeof (response as Record<string, unknown>).altText === 'string',
    extract: (response: AltTextResponse) => ({
      content: response.altText,
      metadata: response as Record<string, unknown>,
    }),
  },

  /**
   * Generator configuration endpoints
   * Format: { name: string, slug: string, fields: array, prompt: string }
   */
  'generator-config': {
    validate: (response: unknown): response is GeneratorConfigResponse => {
      if (typeof response !== 'object' || response === null) {
        return false;
      }

      const responseObj = response as Record<string, unknown>;

      if (
        typeof responseObj.name !== 'string' ||
        typeof responseObj.slug !== 'string' ||
        !Array.isArray(responseObj.fields) ||
        typeof responseObj.prompt !== 'string'
      ) {
        return false;
      }

      return responseObj.fields.every(
        (field: unknown) =>
          typeof field === 'object' &&
          field !== null &&
          typeof (field as Record<string, unknown>).label === 'string' &&
          typeof (field as Record<string, unknown>).name === 'string' &&
          ((field as Record<string, unknown>).type === 'text' ||
            (field as Record<string, unknown>).type === 'textarea' ||
            (field as Record<string, unknown>).type === 'select') &&
          typeof (field as Record<string, unknown>).required === 'boolean' &&
          ((field as Record<string, unknown>).type !== 'select' ||
            (Array.isArray((field as Record<string, unknown>).options) &&
              ((field as Record<string, unknown>).options as unknown[]).length > 0 &&
              ((field as Record<string, unknown>).options as unknown[]).every(
                (opt: unknown) =>
                  opt &&
                  typeof opt === 'object' &&
                  typeof (opt as Record<string, unknown>).label === 'string' &&
                  typeof (opt as Record<string, unknown>).value === 'string'
              )))
      );
    },
    extract: (response: GeneratorConfigResponse) => ({
      content: JSON.stringify(response),
      metadata: response as unknown as Record<string, unknown>,
    }),
  },

  /**
   * Fallback parser for unknown endpoints
   * Accepts any non-null response
   */
  fallback: {
    validate: (response: unknown): response is Record<string, unknown> | string =>
      response !== null && response !== undefined,
    extract: (response: Record<string, unknown> | string) => {
      if (typeof response === 'string') {
        return { content: response, metadata: undefined };
      }

      if (typeof response === 'object') {
        const responseObj = response as Record<string, unknown>;

        // Try to extract content field
        if ('content' in responseObj && typeof responseObj.content === 'string') {
          return {
            content: responseObj.content,
            metadata:
              'metadata' in responseObj && typeof responseObj.metadata === 'object'
                ? (responseObj.metadata as Record<string, unknown>)
                : undefined,
          };
        }

        // Return stringified object as content
        return {
          content: JSON.stringify(response),
          metadata: responseObj,
        };
      }

      return {
        content: String(response),
        metadata: undefined,
      };
    },
  },
};

/**
 * Endpoint to category mapping
 * Add new endpoints here to automatically get the right parser
 */
const ENDPOINT_CATEGORIES: Record<string, EndpointCategory> = {
  // Claude text generation
  '/claude_social': 'claude-text',
  claude_social: 'claude-text',
  '/claude_gruene_jugend': 'claude-text',
  claude_gruene_jugend: 'claude-text',
  '/claude_universal': 'claude-text',
  claude_universal: 'claude-text',
  '/claude_rede': 'claude-text',
  claude_rede: 'claude-text',
  '/claude_wahlprogramm': 'claude-text',
  claude_wahlprogramm: 'claude-text',
  '/claude_buergeranfragen': 'claude-text',
  claude_buergeranfragen: 'claude-text',
  '/claude_alttext': 'alt-text',
  claude_alttext: 'alt-text',
  '/leichte_sprache': 'claude-text',
  leichte_sprache: 'claude-text',
  '/claude_text_adjustment': 'text-adjustment',
  '/claude_think': 'think',
  '/claude_gruenerator_ask': 'ask',

  // Antrag endpoints
  'claude/antrag': 'claude-text',
  'claude/antrag-simple': 'claude-text',
  'antraege/generate-simple': 'claude-text',
  '/antraege/generate-simple': 'claude-text',

  // Campaign generation
  '/campaign_generate': 'claude-text',
  campaign_generate: 'claude-text',

  // Search
  'claude/search-query': 'claude-search',
  search: 'claude-search',

  // Structured responses
  '/dreizeilen_claude': 'claude-structured',
  dreizeilen_claude: 'claude-structured',
  info_claude: 'claude-structured',
  '/info_claude': 'claude-structured',
  headline_claude: 'claude-structured',
  '/headline_claude': 'claude-structured',
  simple_claude: 'claude-structured',
  '/simple_claude': 'claude-structured',
  veranstaltung_claude: 'claude-structured',
  '/veranstaltung_claude': 'claude-structured',
  zitat_claude: 'claude-structured',
  '/zitat_claude': 'claude-structured',
  zitat_pure_claude: 'claude-structured',
  '/zitat_pure_claude': 'claude-structured',
  zitat_abyssale: 'claude-structured',
  '/zitat_abyssale': 'claude-structured',

  // Etherpad
  etherpad: 'etherpad',

  // Documents
  'docs/from-export': 'docs',
  '/docs': 'docs',

  // Analysis
  analyze: 'analyze',
  you: 'analyze',

  // Custom generators
  '/custom_generator': 'custom-generator',
  '/generate_generator_config': 'generator-config',

  // Subtitles
  '/subtitler/correct-subtitles': 'subtitles',
  'subtitler/correct-subtitles': 'subtitles',
};

/**
 * Parses endpoint response using category-based strategy
 *
 * Replaces the 76-line switch statement with a clean mapping approach.
 * To add a new endpoint, just add it to ENDPOINT_CATEGORIES.
 *
 * @param response - Raw API response
 * @param endpoint - Endpoint path
 * @returns Parsed response with success/error discrimination
 *
 * @example
 * ```typescript
 * const result = parseEndpointResponse(apiResponse, '/claude_social');
 * if (result.success) {
 *   console.log(result.content, result.metadata);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function parseEndpointResponse(response: unknown, endpoint: string): ParsedResponse {
  // Handle null/undefined response
  if (response === null || response === undefined) {
    return {
      success: false,
      error: 'Empty response received from API',
    };
  }

  // Get category for endpoint (fallback to 'fallback' if not found)
  const category = ENDPOINT_CATEGORIES[endpoint] || 'fallback';

  // Get parser for category
  const parser = RESPONSE_PARSERS[category];

  // Validate response structure
  if (parser.validate(response)) {
    try {
      const { content, metadata } = parser.extract(response as never);
      return {
        success: true,
        content,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to extract content: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Validation failed - provide more detailed error for debugging
  const responseObj = response as Record<string, unknown>;
  const details: string[] = [];

  if (typeof response !== 'object') {
    details.push(`expected object, got ${typeof response}`);
  } else if (category === 'claude-text') {
    // Specific diagnostics for claude-text category
    if (!('content' in responseObj)) {
      details.push('missing "content" field');
    } else if (typeof responseObj.content !== 'string') {
      details.push(`"content" is ${typeof responseObj.content}, expected string`);
    } else if (responseObj.content === '') {
      details.push('"content" is empty string');
    }
  }

  const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';

  // Log for debugging in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[responseParser] Validation failed for ${endpoint}:`, {
      category,
      responseKeys: typeof response === 'object' ? Object.keys(response as object) : 'not-object',
      contentType: typeof responseObj?.content,
      contentValue:
        typeof responseObj?.content === 'string'
          ? responseObj.content.substring(0, 100) + '...'
          : responseObj?.content,
    });
  }

  return {
    success: false,
    error: `Invalid response format for category '${category}'${detailStr}`,
  };
}

/**
 * Gets the category for an endpoint
 *
 * @param endpoint - Endpoint path
 * @returns Endpoint category
 *
 * @example
 * ```typescript
 * const category = getEndpointCategory('/claude_social');
 * console.log(category); // 'claude-text'
 * ```
 */
export function getEndpointCategory(endpoint: string): EndpointCategory {
  return ENDPOINT_CATEGORIES[endpoint] || 'fallback';
}

/**
 * Checks if an endpoint has a registered parser
 *
 * @param endpoint - Endpoint path
 * @returns True if endpoint has a registered parser
 *
 * @example
 * ```typescript
 * if (hasEndpointParser('/my-endpoint')) {
 *   // Endpoint is registered
 * } else {
 *   // Will use fallback parser
 * }
 * ```
 */
export function hasEndpointParser(endpoint: string): boolean {
  return endpoint in ENDPOINT_CATEGORIES;
}
