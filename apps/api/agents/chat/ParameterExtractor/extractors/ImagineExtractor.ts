/**
 * Imagine (FLUX) Parameter Extractor
 * Handles AI image generation with FLUX
 */

import type { ImagineParameters, BaseParameters } from '../types.js';
import type { ChatContext } from '../../types.js';
import {
  detectImagineMode,
  extractImagineSubject,
  extractImagineVariant,
  extractImagineTitle,
  extractEditAction,
} from '../utils/imagineUtils.js';

/**
 * Extract parameters for imagine agent (FLUX image generation)
 * Detects mode (pure, sharepic, edit), subject, variant, and title
 */
export function extractImagineParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): ImagineParameters {
  const normalizedMessage = message.toLowerCase();

  // Detect imagine mode based on context and keywords
  const mode = detectImagineMode(normalizedMessage, context);

  // Extract subject (what to generate)
  const subject = extractImagineSubject(message, mode);

  // Extract variant/style
  const variantResult = extractImagineVariant(normalizedMessage);

  // Extract title (for sharepic mode)
  const title = mode === 'sharepic' ? extractImagineTitle(message) : null;

  // Extract action (for edit mode)
  const action = mode === 'edit' ? extractEditAction(message) : null;

  console.log('[ImagineExtractor] Imagine params:', {
    mode,
    subject: subject?.substring(0, 50),
    variant: variantResult.variant,
    hasExplicitVariant: variantResult.explicit,
    title,
    action,
  });

  return {
    ...baseParams,
    mode,
    subject: subject || 'Ein Bild',
    variant: variantResult.variant,
    variantExplicit: variantResult.explicit,
    title,
    action,
    _parameterConfidence: {
      ...(baseParams._parameterConfidence || {}),
      subject: subject ? 0.8 : 0.3,
      variant: variantResult.explicit ? 0.9 : 0.3,
      title: title ? 0.9 : 0,
      action: action ? 0.8 : 0,
    },
    _parameterSources: {
      ...(baseParams._parameterSources || {}),
      subject: 'regex',
      variant: variantResult.explicit ? 'regex' : 'default',
      title: title ? 'regex' : 'default',
      action: action ? 'regex' : 'default',
    },
  };
}
