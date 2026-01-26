/**
 * Parameter Extractor for Grünerator Chat
 * Main orchestrator that routes parameter extraction to specialized extractors
 */

import type { ExtractedParameters, BaseParameters } from './types.js';
import type { ChatContext } from '../types.js';
import {
  extractSocialParams,
  extractGrueneJugendParams,
} from './extractors/SocialMediaExtractor.js';
import { extractSharepicParams } from './extractors/SharepicExtractor.js';
import { extractAntragParams } from './extractors/AntragExtractor.js';
import {
  extractUniversalParams,
  extractLeichteSpracheParams,
} from './extractors/UniversalExtractor.js';
import { extractImagineParams } from './extractors/ImagineExtractor.js';
import { extractParametersWithMistral } from './mistral/MistralExtractor.js';
import { analyzeParameterConfidence } from './utils/confidenceAnalyzer.js';

/**
 * Extract parameters from user message based on target agent
 * Routes to appropriate extractor based on agent type
 */
export async function extractParameters(
  message: string,
  agent: string,
  context: ChatContext = {}
): Promise<ExtractedParameters> {
  console.log('[ParameterExtractor] Extracting parameters for agent:', agent);

  const baseParams: BaseParameters = {
    originalMessage: message,
    chatContext: context,
    _parameterConfidence: {},
    _parameterSources: {},
  };

  // For sharepic agents, use Mistral AI for better semantic extraction
  if (['zitat', 'info', 'headline', 'dreizeilen'].includes(agent)) {
    try {
      const mistralParams = await extractParametersWithMistral(message, agent, context);
      return { ...baseParams, ...mistralParams } as ExtractedParameters;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        '[ParameterExtractor] Mistral extraction failed, falling back to regex:',
        errorMessage
      );
      // Fall back to regex-based extraction
      return extractSharepicParams(message, context, baseParams, agent);
    }
  }

  // Agent-specific parameter extraction using specialized extractors
  switch (agent) {
    case 'social_media':
    case 'pressemitteilung':
      return extractSocialParams(message, context, baseParams);

    case 'antrag':
    case 'kleine_anfrage':
    case 'grosse_anfrage':
      return extractAntragParams(message, context, baseParams);

    case 'gruene_jugend':
      return extractGrueneJugendParams(message, context, baseParams);

    case 'leichte_sprache':
      return extractLeichteSpracheParams(message, context, baseParams);

    case 'imagine':
      return extractImagineParams(message, context, baseParams);

    case 'universal':
    default:
      return extractUniversalParams(message, context, baseParams);
  }
}

// Re-export confidence analyzer for external use
export { analyzeParameterConfidence } from './utils/confidenceAnalyzer.js';

// Re-export utility for backward compatibility
export { extractQuoteAuthor } from './utils/extractionUtils.js';
