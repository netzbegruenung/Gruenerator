/**
 * TexteIntentService - AI-powered text type detection and routing
 * Analyzes user prompts to determine the best text generation route
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('TexteIntentService');

/**
 * Text type mappings with routing information
 */
export const TEXT_TYPE_MAPPINGS: Record<string, {
  route: string;
  keywords: string[];
  description: string;
  params?: Record<string, unknown>;
}> = {
  // Social Media
  'social_twitter': {
    route: 'social',
    keywords: ['tweet', 'twitter', 'x post', 'x.com'],
    description: 'Twitter/X Posts (max 280 Zeichen)',
    params: { platforms: ['twitter'] }
  },
  'social_instagram': {
    route: 'social',
    keywords: ['instagram', 'insta', 'ig'],
    description: 'Instagram Posts und Captions',
    params: { platforms: ['instagram'] }
  },
  'social_facebook': {
    route: 'social',
    keywords: ['facebook', 'fb'],
    description: 'Facebook Beiträge',
    params: { platforms: ['facebook'] }
  },
  'social_linkedin': {
    route: 'social',
    keywords: ['linkedin', 'berufsnetzwerk'],
    description: 'LinkedIn professionelle Posts',
    params: { platforms: ['linkedin'] }
  },
  'social_generic': {
    route: 'social',
    keywords: ['social media', 'social post', 'beitrag'],
    description: 'Allgemeine Social Media Posts',
    params: { platforms: ['instagram', 'facebook'] }
  },

  // Press
  'pressemitteilung': {
    route: 'social',
    keywords: ['pressemitteilung', 'presse', 'pm', 'medien', 'presseverteiler'],
    description: 'Pressemitteilungen für Medienverteilung',
    params: { platforms: ['pressemitteilung'] }
  },

  // Political documents
  'antrag': {
    route: 'antrag_simple',
    keywords: ['antrag', 'beschluss', 'gemeinderat', 'stadtrat', 'kommunalpolitik'],
    description: 'Politische Anträge und Beschlüsse',
    params: { requestType: 'default' }
  },
  'kleine_anfrage': {
    route: 'antrag_simple',
    keywords: ['kleine anfrage', 'anfrage'],
    description: 'Kleine parlamentarische Anfragen',
    params: { requestType: 'kleine_anfrage' }
  },
  'grosse_anfrage': {
    route: 'antrag_simple',
    keywords: ['große anfrage', 'grosse anfrage'],
    description: 'Große parlamentarische Anfragen',
    params: { requestType: 'grosse_anfrage' }
  },

  // Speeches
  'rede': {
    route: 'rede',
    keywords: ['rede', 'ansprache', 'vortrag', 'grußwort', 'speech'],
    description: 'Reden und Ansprachen',
    params: {}
  },

  // Communication
  'email': {
    route: 'universal',
    keywords: ['email', 'e-mail', 'mail', 'nachricht', 'anschreiben'],
    description: 'E-Mails und Anschreiben',
    params: { textForm: 'email' }
  },
  'brief': {
    route: 'universal',
    keywords: ['brief', 'schreiben', 'formell'],
    description: 'Formelle Briefe',
    params: { textForm: 'brief' }
  },

  // Content transformation
  'zusammenfassung': {
    route: 'universal',
    keywords: ['zusammenfassung', 'zusammenfassen', 'kürzen', 'summary'],
    description: 'Texte zusammenfassen',
    params: { textForm: 'zusammenfassung' }
  },
  'leichte_sprache': {
    route: 'leichte_sprache',
    keywords: ['leichte sprache', 'einfach', 'vereinfachen', 'verständlich'],
    description: 'In Leichte Sprache übersetzen',
    params: {}
  },

  // Programs and documents
  'wahlprogramm': {
    route: 'wahlprogramm',
    keywords: ['wahlprogramm', 'programm', 'wahlkampf'],
    description: 'Wahlprogramm-Texte',
    params: {}
  },
  'buergeranfragen': {
    route: 'buergeranfragen',
    keywords: ['bürgeranfrage', 'bürgerinnenanfrage', 'bürger'],
    description: 'Antworten auf Bürgeranfragen',
    params: {}
  },

  // Universal fallback
  'universal': {
    route: 'universal',
    keywords: ['text', 'schreiben', 'erstellen'],
    description: 'Allgemeine Texte',
    params: { textForm: 'universal' }
  }
};

/**
 * Detected text type result
 */
export interface TextTypeDetectionResult {
  detectedType: string;
  route: string;
  confidence: number;
  params: Record<string, unknown>;
  method: 'ai' | 'keyword' | 'fallback';
}

/**
 * Detect text type using keywords
 */
export function detectTypeByKeywords(message: string): TextTypeDetectionResult | null {
  const normalized = message.toLowerCase().trim();

  const matches: Array<{ type: string; mapping: typeof TEXT_TYPE_MAPPINGS[string]; keywordLength: number }> = [];

  for (const [typeName, mapping] of Object.entries(TEXT_TYPE_MAPPINGS)) {
    for (const keyword of mapping.keywords) {
      if (normalized.includes(keyword)) {
        matches.push({
          type: typeName,
          mapping,
          keywordLength: keyword.length
        });
      }
    }
  }

  if (matches.length === 0) return null;

  // Sort by keyword length (longer = more specific)
  matches.sort((a, b) => b.keywordLength - a.keywordLength);
  const best = matches[0];

  return {
    detectedType: best.type,
    route: best.mapping.route,
    confidence: 0.85,
    params: best.mapping.params || {},
    method: 'keyword'
  };
}

/**
 * AI-powered text type detection
 */
export async function detectTypeWithAI(
  message: string,
  aiWorkerPool: any
): Promise<TextTypeDetectionResult | null> {
  if (!aiWorkerPool) {
    log.warn('[TexteIntentService] No AI worker pool available');
    return null;
  }

  const typeDescriptions = Object.entries(TEXT_TYPE_MAPPINGS)
    .map(([name, mapping]) => `- ${name}: ${mapping.description}`)
    .join('\n');

  const classificationPrompt = `Analysiere diese Textanfrage und bestimme den passenden Texttyp:

"${message}"

Verfügbare Texttypen:
${typeDescriptions}

REGELN:
- Bei Social Media Plattformen: Wähle die spezifische Plattform (social_twitter, social_instagram, etc.)
- Bei "Post" ohne Plattform: social_generic
- Bei Reden/Ansprachen: rede
- Bei E-Mails/Nachrichten: email
- Bei Zusammenfassungen: zusammenfassung
- Bei Pressemitteilungen: pressemitteilung
- Bei Anträgen: antrag
- Bei unklaren Anfragen: universal

Antworte NUR mit JSON:
{"textType": "...", "confidence": 0.9}`;

  try {
    log.debug('[TexteIntentService] Calling AI for text type detection');

    const result = await aiWorkerPool.processRequest({
      type: 'texte_intent_classification',
      systemPrompt: 'Du bist ein präziser Texttyp-Klassifikator. Antworte NUR mit validem JSON.',
      messages: [{ role: 'user', content: classificationPrompt }],
      options: {
        max_tokens: 150,
        temperature: 0.2
      }
    });

    if (!result.success) {
      throw new Error(`AI classification failed: ${result.error}`);
    }

    // Parse response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('[TexteIntentService] Could not parse AI response:', result.content);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const textType = parsed.textType || 'universal';
    const mapping = TEXT_TYPE_MAPPINGS[textType] || TEXT_TYPE_MAPPINGS['universal'];

    log.debug('[TexteIntentService] AI detected type:', textType, 'confidence:', parsed.confidence);

    return {
      detectedType: textType,
      route: mapping.route,
      confidence: parsed.confidence || 0.8,
      params: mapping.params || {},
      method: 'ai'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn('[TexteIntentService] AI detection error:', errorMessage);
    return null;
  }
}

/**
 * Main detection function - tries AI first, falls back to keywords
 */
export async function detectTextType(
  message: string,
  aiWorkerPool: any
): Promise<TextTypeDetectionResult> {
  log.debug('[TexteIntentService] Detecting text type for:', message.substring(0, 100));

  // Step 1: Try AI detection
  if (aiWorkerPool) {
    const aiResult = await detectTypeWithAI(message, aiWorkerPool);
    if (aiResult && aiResult.confidence >= 0.7) {
      log.debug('[TexteIntentService] Using AI detection:', aiResult.detectedType);
      return aiResult;
    }
  }

  // Step 2: Keyword fallback
  const keywordResult = detectTypeByKeywords(message);
  if (keywordResult) {
    log.debug('[TexteIntentService] Using keyword detection:', keywordResult.detectedType);
    return keywordResult;
  }

  // Step 3: Default fallback
  log.debug('[TexteIntentService] Using universal fallback');
  return {
    detectedType: 'universal',
    route: 'universal',
    confidence: 0.3,
    params: { textForm: 'universal' },
    method: 'fallback'
  };
}
