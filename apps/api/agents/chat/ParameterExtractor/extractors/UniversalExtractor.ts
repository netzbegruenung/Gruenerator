/**
 * Universal Text Generation Parameter Extractor
 * Handles general text generation and Leichte Sprache
 */

import type { UniversalParameters, LeichteSpracheParameters, BaseParameters } from '../types.js';
import type { ChatContext } from '../../types.js';
import {
  extractTextForm,
  extractStyle,
  extractTheme,
  extractDetails
} from '../utils/extractionUtils.js';

/**
 * Extract parameters for universal agent
 */
export function extractUniversalParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): UniversalParameters {
  const textForm = extractTextForm(message);
  const sprache = extractStyle(message);
  const thema = extractTheme(message, context);
  const details = extractDetails(message, thema);

  return {
    ...baseParams,
    textForm: textForm || 'Allgemeiner Text',
    sprache: sprache || 'Sachlich und informativ',
    thema: thema || 'Politisches Thema',
    details: details || message
  };
}

/**
 * Extract parameters for Leichte Sprache agent
 */
export function extractLeichteSpracheParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): LeichteSpracheParameters {
  // For simple language, the original text to translate is key
  let originalText = message;

  // Check if user is referring to previous content
  if (context.messageHistory && context.messageHistory.length > 0) {
    const lastMessage = context.messageHistory[context.messageHistory.length - 1];
    if (message.includes('das') || message.includes('daraus') || message.includes('übersetze')) {
      originalText = lastMessage.content;
    }
  }

  return {
    ...baseParams,
    originalText,
    targetLanguage: 'Leichte Sprache'
  };
}
