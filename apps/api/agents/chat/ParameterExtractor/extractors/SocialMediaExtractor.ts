/**
 * Social Media Parameter Extractor
 * Handles social media posts and press releases
 */

import type { SocialMediaParameters, GrueneJugendParameters, BaseParameters } from '../types.js';
import type { ChatContext } from '../../types.js';
import {
  extractTheme,
  extractDetails,
  extractPlatforms,
  extractQuoteAuthor,
} from '../utils/extractionUtils.js';

/**
 * Extract parameters for social media and press release agents
 */
export function extractSocialParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): SocialMediaParameters {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);
  const platforms = extractPlatforms(message);

  return {
    ...baseParams,
    thema: thema || 'Politisches Thema',
    details: details || message,
    platforms: platforms.length > 0 ? platforms : ['facebook'], // Default platform
    was: null, // For press releases
    wie: null,
    zitatgeber: extractQuoteAuthor(message),
  };
}

/**
 * Extract parameters for Grüne Jugend agent
 */
export function extractGrueneJugendParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): GrueneJugendParameters {
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);
  const platforms = extractPlatforms(message);

  return {
    ...baseParams,
    thema: thema || 'Aktivismus und Politik',
    details: details || message,
    platforms: platforms.length > 0 ? platforms : ['instagram', 'twitter'], // Default youth platforms
  };
}
