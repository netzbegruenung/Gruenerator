/**
 * Antrag (Proposal/Inquiry) Parameter Extractor
 * Handles municipal proposals and parliamentary inquiries
 */

import type { AntragParameters, BaseParameters } from '../types.js';
import type { ChatContext } from '../../types.js';
import {
  extractTheme,
  extractDetails,
  extractStructure,
  determineRequestType
} from '../utils/extractionUtils.js';

/**
 * Extract parameters for proposal/inquiry agents
 */
export function extractAntragParams(
  message: string,
  context: ChatContext,
  baseParams: BaseParameters
): AntragParameters {
  const idee = extractTheme(message, context) || message;
  const details = extractDetails(message, idee);
  const gliederung = extractStructure(message);

  return {
    ...baseParams,
    idee,
    details: details || message,
    gliederung,
    requestType: determineRequestType(message)
  };
}
