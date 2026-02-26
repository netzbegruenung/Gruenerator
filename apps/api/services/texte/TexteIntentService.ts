/**
 * TexteIntentService - AI-powered text type detection and routing
 * Analyzes user prompts to determine the best text generation route
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('TexteIntentService');

const GERMAN_LETTER = '[a-zA-ZäöüÄÖÜß]';

/**
 * Word-boundary-aware keyword matching for German text.
 * Standard \b treats umlauts as word boundaries, so we use negative lookaround
 * with a custom German letter class to prevent substring matches in compound words.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  if (keyword.includes(' ') || keyword.includes('*')) {
    return text.includes(keyword);
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!${GERMAN_LETTER})${escaped}(?!${GERMAN_LETTER})`, 'i').test(text);
}

/**
 * Compute graduated confidence based on keyword match quality.
 */
function computeKeywordConfidence(keyword: string, matchCount: number): number {
  const isMultiWord = keyword.includes(' ') || keyword.includes('*');
  let base: number;
  if (isMultiWord) {
    base = 0.9;
  } else if (keyword.length > 10) {
    base = 0.85;
  } else if (keyword.length >= 7) {
    base = 0.75;
  } else {
    base = 0.65;
  }
  const bonus = Math.min((matchCount - 1) * 0.05, 0.1);
  return Math.min(base + bonus, 0.95);
}

/**
 * Text type mappings with routing information
 */
export const TEXT_TYPE_MAPPINGS: Record<
  string,
  {
    route: string;
    keywords: string[];
    description: string;
    params?: Record<string, unknown>;
  }
> = {
  // Social Media
  social_twitter: {
    route: 'social',
    keywords: ['tweet', 'twitter', 'x post', 'x.com'],
    description: 'Twitter/X Posts (max 280 Zeichen)',
    params: { platforms: ['twitter'] },
  },
  social_instagram: {
    route: 'social',
    keywords: ['instagram', 'insta', 'ig'],
    description: 'Instagram Posts und Captions',
    params: { platforms: ['instagram'] },
  },
  social_facebook: {
    route: 'social',
    keywords: ['facebook', 'fb'],
    description: 'Facebook Beiträge',
    params: { platforms: ['facebook'] },
  },
  social_linkedin: {
    route: 'social',
    keywords: ['linkedin', 'berufsnetzwerk'],
    description: 'LinkedIn professionelle Posts',
    params: { platforms: ['linkedin'] },
  },
  social_generic: {
    route: 'social',
    keywords: ['social media', 'social post', 'beitrag'],
    description: 'Allgemeine Social Media Posts',
    params: { platforms: ['instagram', 'facebook'] },
  },

  // Press
  pressemitteilung: {
    route: 'social',
    keywords: ['pressemitteilung', 'presse', 'pm', 'medien', 'presseverteiler'],
    description: 'Pressemitteilungen für Medienverteilung',
    params: { platforms: ['pressemitteilung'] },
  },

  // Political documents
  antrag: {
    route: 'antrag_simple',
    keywords: ['antrag', 'beschluss', 'gemeinderat', 'stadtrat', 'kommunalpolitik'],
    description: 'Politische Anträge und Beschlüsse',
    params: { requestType: 'default' },
  },
  kleine_anfrage: {
    route: 'antrag_simple',
    keywords: ['kleine anfrage', 'anfrage'],
    description: 'Kleine parlamentarische Anfragen',
    params: { requestType: 'kleine_anfrage' },
  },
  grosse_anfrage: {
    route: 'antrag_simple',
    keywords: ['große anfrage', 'grosse anfrage'],
    description: 'Große parlamentarische Anfragen',
    params: { requestType: 'grosse_anfrage' },
  },

  // Speeches
  rede: {
    route: 'rede',
    keywords: ['rede', 'ansprache', 'vortrag', 'grußwort', 'speech'],
    description: 'Reden und Ansprachen',
    params: {},
  },

  // Communication
  email: {
    route: 'universal',
    keywords: ['email', 'e-mail', 'mail', 'nachricht', 'anschreiben'],
    description: 'E-Mails und Anschreiben',
    params: { textForm: 'email' },
  },
  brief: {
    route: 'universal',
    keywords: ['brief', 'formeller brief', 'briefvorlage'],
    description: 'Formelle Briefe',
    params: { textForm: 'brief' },
  },

  // Content transformation
  zusammenfassung: {
    route: 'universal',
    keywords: ['zusammenfassung', 'zusammenfassen', 'kürzen', 'summary'],
    description: 'Texte zusammenfassen',
    params: { textForm: 'zusammenfassung' },
  },
  leichte_sprache: {
    route: 'leichte_sprache',
    keywords: ['leichte sprache', 'vereinfachen', 'verständlich'],
    description: 'In Leichte Sprache übersetzen',
    params: {},
  },

  // Programs and documents
  wahlprogramm: {
    route: 'wahlprogramm',
    keywords: ['wahlprogramm', 'wahlkampf'],
    description: 'Wahlprogramm-Texte',
    params: {},
  },
  buergeranfragen: {
    route: 'buergeranfragen',
    keywords: ['bürgeranfrage', 'bürgerinnenanfrage', 'bürger*innenanfrage', 'bürger anfrage'],
    description: 'Antworten auf Bürgeranfragen',
    params: {},
  },

  // Universal fallback
  universal: {
    route: 'universal',
    keywords: [
      'text erstellen',
      'text schreiben',
      'erstelle einen text',
      'schreib mir',
      'newsletter',
      'rundschreiben',
    ],
    description: 'Allgemeine Texte',
    params: { textForm: 'universal' },
  },
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
 * Detect text type using word-boundary-aware keyword matching with graduated confidence.
 */
export function detectTypeByKeywords(message: string): TextTypeDetectionResult | null {
  const normalized = message.toLowerCase().trim();

  const matchesByType = new Map<
    string,
    {
      mapping: (typeof TEXT_TYPE_MAPPINGS)[string];
      bestKeyword: string;
      matchCount: number;
      score: number;
    }
  >();

  for (const [typeName, mapping] of Object.entries(TEXT_TYPE_MAPPINGS)) {
    let bestKeyword = '';
    let matchCount = 0;

    for (const keyword of mapping.keywords) {
      if (keywordMatches(normalized, keyword)) {
        matchCount++;
        if (keyword.length > bestKeyword.length) {
          bestKeyword = keyword;
        }
      }
    }

    if (matchCount > 0) {
      const isMultiWord = bestKeyword.includes(' ') || bestKeyword.includes('*');
      const isExactTypeMatch = normalized.includes(typeName.replace(/_/g, ' '));
      let score = bestKeyword.length * 2;
      if (isMultiWord) score += 20;
      if (matchCount > 1) score += matchCount * 5;
      if (isExactTypeMatch) score += 15;

      matchesByType.set(typeName, {
        mapping,
        bestKeyword,
        matchCount,
        score,
      });
    }
  }

  if (matchesByType.size === 0) return null;

  // Pick the type with the highest composite score
  let bestType = '';
  let bestEntry: (typeof matchesByType extends Map<string, infer V> ? V : never) | null = null;
  for (const [typeName, entry] of matchesByType) {
    if (!bestEntry || entry.score > bestEntry.score) {
      bestType = typeName;
      bestEntry = entry;
    }
  }

  const confidence = computeKeywordConfidence(bestEntry!.bestKeyword, bestEntry!.matchCount);

  return {
    detectedType: bestType,
    route: bestEntry!.mapping.route,
    confidence,
    params: bestEntry!.mapping.params || {},
    method: 'keyword',
  };
}

/**
 * AI-powered text type detection, optionally with a keyword hint for disambiguation.
 */
export async function detectTypeWithAI(
  message: string,
  aiWorkerPool: any,
  hint?: { type: string; description: string }
): Promise<TextTypeDetectionResult | null> {
  if (!aiWorkerPool) {
    log.warn('[TexteIntentService] No AI worker pool available');
    return null;
  }

  const typeDescriptions = Object.entries(TEXT_TYPE_MAPPINGS)
    .map(([name, mapping]) => `- ${name}: ${mapping.description}`)
    .join('\n');

  const hintSection = hint
    ? `\nHINWEIS: Eine Keyword-Analyse deutet auf "${hint.type}" (${hint.description}) hin. Bestätige oder korrigiere dies.\n`
    : '';

  const classificationPrompt = `Analysiere diese Textanfrage und bestimme den passenden Texttyp:

"${message}"
${hintSection}
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
    log.debug(
      '[TexteIntentService] Calling AI for text type detection',
      hint ? `(hint: ${hint.type})` : ''
    );

    const result = await aiWorkerPool.processRequest({
      type: 'texte_intent_classification',
      systemPrompt: 'Du bist ein präziser Texttyp-Klassifikator. Antworte NUR mit validem JSON.',
      messages: [{ role: 'user', content: classificationPrompt }],
      options: {
        max_tokens: 150,
        temperature: 0.2,
      },
    });

    if (!result.success) {
      throw new Error(`AI classification failed: ${result.error}`);
    }

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
      method: 'ai',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn('[TexteIntentService] AI detection error:', errorMessage);
    return null;
  }
}

/**
 * Main detection: keyword match → graduated confidence → optional AI confirmation → fallback.
 *
 * High-confidence keyword (>=0.80): return immediately (e.g. "pressemitteilung")
 * Medium-confidence keyword (0.60–0.79): pass as hint to AI for confirmation
 * Low-confidence or no match: pure AI detection
 */
export async function detectTextType(
  message: string,
  aiWorkerPool: any
): Promise<TextTypeDetectionResult> {
  log.debug('[TexteIntentService] Detecting text type for:', message.substring(0, 100));

  const keywordResult = detectTypeByKeywords(message);

  if (keywordResult && keywordResult.confidence >= 0.8) {
    log.debug(
      '[TexteIntentService] High-confidence keyword match:',
      keywordResult.detectedType,
      keywordResult.confidence
    );
    return keywordResult;
  }

  if (aiWorkerPool) {
    const hint =
      keywordResult && keywordResult.confidence >= 0.6
        ? {
            type: keywordResult.detectedType,
            description: TEXT_TYPE_MAPPINGS[keywordResult.detectedType]?.description || '',
          }
        : undefined;

    if (hint) {
      log.debug(
        '[TexteIntentService] Medium-confidence keyword, sending hint to AI:',
        hint.type,
        keywordResult!.confidence
      );
    }

    const aiResult = await detectTypeWithAI(message, aiWorkerPool, hint);
    if (aiResult && aiResult.confidence >= 0.7) {
      log.debug('[TexteIntentService] Using AI detection:', aiResult.detectedType);
      return aiResult;
    }
  }

  // If AI is unavailable but we have a medium-confidence keyword, use it as best-effort
  if (keywordResult && keywordResult.confidence >= 0.6) {
    log.debug(
      '[TexteIntentService] AI unavailable, using medium-confidence keyword:',
      keywordResult.detectedType
    );
    return keywordResult;
  }

  log.debug('[TexteIntentService] Using universal fallback');
  return {
    detectedType: 'universal',
    route: 'universal',
    confidence: 0.3,
    params: { textForm: 'universal' },
    method: 'fallback',
  };
}
