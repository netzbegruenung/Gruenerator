/**
 * Sharepic Parameter Extractor
 * Handles zitat, info, headline, and dreizeilen sharepics
 */

import type { SharepicParameters, ZitatParameters, DreiZeilenParameters, BaseParameters } from '../types.js';
import type { ChatContext } from '../../types.js';
import {
  extractTheme,
  extractDetails,
  extractQuoteAuthor,
  extractLines
} from '../utils/extractionUtils.js';

/**
 * Extract parameters for sharepic agents
 */
export function extractSharepicParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters,
  agent: string
): SharepicParameters | ZitatParameters | DreiZeilenParameters {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);

  // Base parameters for all sharepic types
  const params: Record<string, unknown> = {
    ...baseParams,
    thema: thema || 'Grüne Politik',
    details: details || message,
    type: agent
  };

  // Agent-specific additions
  switch (agent) {
    case 'zitat':
      const authorResult = extractQuoteAuthor(message);
      params.name = authorResult.value || 'Unbekannt';
      params._parameterConfidence = params._parameterConfidence || {};
      (params._parameterConfidence as Record<string, number>).name = authorResult.confidence;
      params._parameterSources = params._parameterSources || {};
      (params._parameterSources as Record<string, string>).name = authorResult.source;
      break;

    case 'dreizeilen':
      // Check if user provided specific lines
      const lines = extractLines(message);
      if (lines) {
        params.line1 = lines.line1;
        params.line2 = lines.line2;
        params.line3 = lines.line3;
      }
      break;

    case 'info':
    case 'headline':
    default:
      // Use base parameters
      break;
  }

  return params as unknown as SharepicParameters | ZitatParameters | DreiZeilenParameters;
}
