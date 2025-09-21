/**
 * Intent Classifier for Grünerator Chat
 * Maps user messages to appropriate text generation agents
 */

// Agent mappings with routing information
const AGENT_MAPPINGS = {
  // Text generation agents (existing prompt configs)
  'social_media': {
    route: 'social',
    keywords: ['social media', 'facebook', 'instagram', 'twitter', 'linkedin', 'post', 'beitrag'],
    description: 'Social media posts for various platforms',
    params: {}
  },
  'pressemitteilung': {
    route: 'social',
    keywords: ['pressemitteilung', 'presse', 'medien', 'presseverteiler', 'journalisten'],
    description: 'Press releases for media distribution',
    params: { platforms: ['pressemitteilung'] }
  },
  'antrag': {
    route: 'antrag_simple',
    keywords: ['antrag', 'kommunalpolitik', 'gemeinderat', 'stadtrat', 'beschluss'],
    description: 'Municipal proposals and motions',
    params: { requestType: 'default' }
  },
  'kleine_anfrage': {
    route: 'antrag_simple',
    keywords: ['kleine anfrage', 'anfrage', 'fragen', 'information'],
    description: 'Small parliamentary inquiries',
    params: { requestType: 'kleine_anfrage' }
  },
  'grosse_anfrage': {
    route: 'antrag_simple',
    keywords: ['große anfrage', 'grosse anfrage', 'umfassende anfrage', 'politische debatte'],
    description: 'Large parliamentary inquiries',
    params: { requestType: 'grosse_anfrage' }
  },
  'gruene_jugend': {
    route: 'gruene_jugend',
    keywords: ['grüne jugend', 'jugend', 'aktivismus', 'radikal', 'jugendlich'],
    description: 'Youth-oriented political content',
    params: {}
  },
  'leichte_sprache': {
    route: 'leichte_sprache',
    keywords: ['leichte sprache', 'einfach', 'verständlich', 'barrierefrei', 'übersetzen'],
    description: 'Simple language translation',
    params: {}
  },
  'universal': {
    route: 'universal',
    keywords: ['text', 'schreiben', 'erstellen', 'allgemein'],
    description: 'General text generation',
    params: {}
  },

  // Sharepic text generation agents
  'sharepic_auto': {
    route: 'sharepic',
    keywords: ['sharepic', 'share-pic', 'bild erstellen', 'grafik erstellen'],
    description: 'AI-powered sharepic generation with intelligent type selection',
    params: { type: 'auto' }
  },
  'zitat': {
    route: 'sharepic',
    keywords: ['zitat', 'quote', 'spruch', 'aussage'],
    description: 'Quote generation for sharepics (no image)',
    params: { type: 'zitat_pure' }
  },
  'zitat_with_image': {
    route: 'sharepic',
    keywords: ['zitat', 'quote', 'spruch', 'aussage'],
    description: 'Quote generation for sharepics with uploaded image',
    params: { type: 'zitat' }
  },
  'info': {
    route: 'sharepic',
    keywords: ['info', 'information', 'fakten', 'sharepic info'],
    description: 'Information blocks for sharepics',
    params: { type: 'info' }
  },
  'headline': {
    route: 'sharepic',
    keywords: ['headline', 'schlagzeile', 'titel', 'überschrift'],
    description: 'Headlines for sharepics',
    params: { type: 'headline' }
  },
  'dreizeilen': {
    route: 'sharepic',
    keywords: ['dreizeilen', 'slogan', 'drei zeilen', 'dreizeilen sharepic'],
    description: 'Three-line slogans for sharepics (requires image)',
    params: { type: 'dreizeilen' }
  },
  'dreizeilen_text_only': {
    route: 'sharepic',
    keywords: ['dreizeilen', 'slogan', 'drei zeilen'],
    description: 'Three-line slogans for sharepics (no image provided)',
    params: { type: 'dreizeilen' }
  }
};

/**
 * AI-powered multi-intent classification
 * Detects multiple intents in one message and supports parallel processing
 * @param {string} message - User's message
 * @param {object} context - Chat context from previous messages
 * @param {object} aiWorkerPool - AI worker pool for AI classification
 * @returns {object} Classification result with multiple intents
 */
async function classifyIntent(message, context = {}, aiWorkerPool = null) {
  console.log('[IntentClassifier] Using AI-powered multi-intent classification:', message.substring(0, 100));

  // Step 1: Try AI-powered multi-intent detection first
  if (aiWorkerPool) {
    try {
      const aiResult = await classifyWithAI(message, context, aiWorkerPool);
      if (aiResult && aiResult.length > 0) {
        console.log('[IntentClassifier] AI detected', aiResult.length, 'intents');
        return {
          isMultiIntent: aiResult.length > 1,
          intents: aiResult,
          method: 'ai',
          confidence: Math.max(...aiResult.map(i => i.confidence || 0.8))
        };
      }
    } catch (error) {
      console.warn('[IntentClassifier] AI classification failed, falling back:', error.message);
    }
  }

  // Step 2: Fallback to keyword-based detection (single intent)
  const normalizedMessage = message.toLowerCase().trim();
  const keywordMatch = findKeywordMatch(normalizedMessage);
  if (keywordMatch) {
    console.log('[IntentClassifier] Keyword fallback match:', keywordMatch.agent);
    return {
      isMultiIntent: false,
      intents: [{
        agent: keywordMatch.agent,
        route: keywordMatch.mapping.route,
        params: keywordMatch.mapping.params,
        confidence: 0.9
      }],
      method: 'keyword'
    };
  }

  // Step 3: Context-based classification fallback
  const contextMatch = classifyFromContext(normalizedMessage, context);
  if (contextMatch) {
    console.log('[IntentClassifier] Context fallback match:', contextMatch.agent);
    return {
      isMultiIntent: false,
      intents: [{
        agent: contextMatch.agent,
        route: contextMatch.route,
        params: contextMatch.params,
        confidence: contextMatch.confidence
      }],
      method: 'context'
    };
  }

  // Step 4: Default fallback to universal agent
  console.log('[IntentClassifier] Using universal agent fallback');
  return {
    isMultiIntent: false,
    intents: [{
      agent: 'universal',
      route: 'universal',
      params: {},
      confidence: 0.3
    }],
    method: 'fallback'
  };
}

/**
 * Find keyword matches in user message
 * @param {string} normalizedMessage - Lowercase user message
 * @returns {object|null} Match result or null
 */
function findKeywordMatch(normalizedMessage) {
  for (const [agentName, mapping] of Object.entries(AGENT_MAPPINGS)) {
    for (const keyword of mapping.keywords) {
      if (normalizedMessage.includes(keyword)) {
        return {
          agent: agentName,
          mapping: mapping,
          keyword: keyword
        };
      }
    }
  }
  return null;
}

/**
 * AI-powered multi-intent classification
 * Detects multiple intents in one message using structured output
 * @param {string} message - Original user message
 * @param {object} context - Chat context
 * @param {object} aiWorkerPool - AI worker pool instance
 * @returns {array|null} Array of detected intents
 */
async function classifyWithAI(message, context, aiWorkerPool) {
  if (!aiWorkerPool) {
    console.log('[IntentClassifier] No AI worker pool available');
    return null;
  }

  // Create a comprehensive prompt for multi-intent detection
  const agentDescriptions = Object.entries(AGENT_MAPPINGS)
    .map(([name, mapping]) => `- ${name}: ${mapping.description}`)
    .join('\n');

  // Build conversation context if available
  let conversationContext = '';
  if (context.messageHistory && context.messageHistory.length > 0) {
    const recentMessages = context.messageHistory.slice(-5).map(msg => {
      const content = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
      return `${msg.role}: ${content}`;
    }).join('\n');

    conversationContext = `\nBisheriger Gesprächsverlauf (letzte ${Math.min(5, context.messageHistory.length)} Nachrichten):
${recentMessages}

`;
  }

  // Check for image attachments
  const hasImageAttachment = context.hasImageAttachment || false;
  const imageContext = hasImageAttachment ? '\nBILD HOCHGELADEN: Ja (Benutzer hat ein Bild angehängt)' : '\nBILD HOCHGELADEN: Nein';

  const classificationPrompt = `${conversationContext}Analysiere diese neue Nachricht und erkenne ALLE gewünschten Aktionen:
"${message}"${imageContext}

${context.lastAgent ? `Letzter verwendeter Agent: ${context.lastAgent}` : ''}
${context.topic ? `Aktuelles Thema: ${context.topic}` : ''}

Verfügbare Agenten:
${agentDescriptions}

WICHTIG:
- Berücksichtige den Gesprächskontext bei der Klassifikation
- Erkenne mehrere Intents wenn der Nutzer Wörter wie "und", "sowie", "außerdem", "auch" verwendet
- Bei unklaren Anfragen nutze den bisherigen Kontext zur Interpretation
- BILD-KONTEXT: Wenn ein Bild hochgeladen wurde und Nutzer "zitat" oder "quote" erwähnt, wähle "zitat_with_image", nicht "zitat"
- BILD-KONTEXT: "dreizeilen" benötigt immer ein Bild, verwende "dreizeilen" bei vorhandenem Bild
- OHNE BILD: Für reine Text-Zitate verwende "zitat" (wird zu zitat_pure)

Beispiele:
- "erstelle ein sharepic und einen instagram text" → 2 Intents: sharepic_auto + social_media
- "schreibe einen presseartikel" → 1 Intent: pressemitteilung
- "mache ein zitat und eine pressemitteilung" → 2 Intents: zitat + pressemitteilung
- "erstelle ein zitat sharepic" (mit Bild) → 1 Intent: zitat_with_image
- "erstelle ein zitat sharepic" (ohne Bild) → 1 Intent: zitat
- "mache dreizeilen" (mit Bild) → 1 Intent: dreizeilen
- "mache dreizeilen" (ohne Bild) → 1 Intent: dreizeilen_text_only
- "mache ein info sharepic" → 1 Intent: info (nicht sharepic_auto + info!)
- Bei vorherigem Text: "mache daraus ein sharepic" → 1 Intent: sharepic_auto

Antworte als JSON Array mit allen erkannten Intents:
[
  {"agent": "sharepic_auto", "confidence": 0.95},
  {"agent": "social_media", "confidence": 0.90, "params": {"platforms": ["instagram"]}}
]

Wenn nur ein Intent erkannt wird, verwende trotzdem Array-Format.`;

  try {
    console.log('[IntentClassifier] Calling AI for multi-intent classification');

    const result = await aiWorkerPool.processRequest({
      type: 'intent_classification',
      systemPrompt: 'Du bist ein präziser Intent-Klassifikator. Antworte NUR mit validem JSON Array.',
      messages: [{ role: 'user', content: classificationPrompt }],
      options: {
        max_tokens: 400,
        temperature: 0.3
      }
    });

    if (!result.success) {
      throw new Error(`AI classification failed: ${result.error}`);
    }

    // Parse the AI response
    let parsedIntents;
    try {
      // Try to extract JSON from response
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedIntents = JSON.parse(jsonMatch[0]);
      } else {
        parsedIntents = JSON.parse(result.content);
      }
    } catch (parseError) {
      console.warn('[IntentClassifier] Failed to parse AI response:', result.content);
      return null;
    }

    // Ensure we have an array
    if (!Array.isArray(parsedIntents)) {
      parsedIntents = [parsedIntents];
    }

    // Validate and enrich intents
    const validIntents = parsedIntents
      .filter(intent => intent && intent.agent && AGENT_MAPPINGS[intent.agent])
      .map(intent => ({
        agent: intent.agent,
        route: AGENT_MAPPINGS[intent.agent].route,
        params: {
          ...AGENT_MAPPINGS[intent.agent].params,
          ...intent.params
        },
        confidence: intent.confidence || 0.8
      }));

    if (validIntents.length === 0) {
      console.warn('[IntentClassifier] No valid intents found in AI response');
      return null;
    }

    console.log('[IntentClassifier] AI successfully classified', validIntents.length, 'intents:',
                validIntents.map(i => i.agent));
    return validIntents;

  } catch (error) {
    console.warn('[IntentClassifier] AI classification error:', error.message);
    return null;
  }
}

/**
 * Classify based on conversation context
 * @param {string} normalizedMessage - Lowercase user message
 * @param {object} context - Chat context
 * @returns {object|null} Classification result
 */
function classifyFromContext(normalizedMessage, context) {
  // If user says "make this into a quote/sharepic/etc", use context
  const transformationKeywords = [
    'daraus', 'davon', 'das', 'mache', 'erstelle', 'wandle um', 'konvertiere'
  ];

  const hasTransformationKeyword = transformationKeywords.some(keyword =>
    normalizedMessage.includes(keyword)
  );

  if (hasTransformationKeyword && context.lastAgent) {
    // Check if user wants to transform to a sharepic type
    if (normalizedMessage.includes('zitat') || normalizedMessage.includes('quote')) {
      return {
        agent: 'zitat',
        route: 'sharepic',
        params: { type: 'zitat_pure' },
        confidence: 0.8
      };
    }
    if (normalizedMessage.includes('info')) {
      return {
        agent: 'info',
        route: 'sharepic',
        params: { type: 'info' },
        confidence: 0.8
      };
    }
    if (normalizedMessage.includes('headline')) {
      return {
        agent: 'headline',
        route: 'sharepic',
        params: { type: 'headline' },
        confidence: 0.8
      };
    }
    if (normalizedMessage.includes('leichte sprache') || normalizedMessage.includes('einfach')) {
      return {
        agent: 'leichte_sprache',
        route: 'leichte_sprache',
        params: {},
        confidence: 0.8
      };
    }
  }

  return null;
}

/**
 * Get available agents with descriptions
 * @returns {object} Available agents mapping
 */
function getAvailableAgents() {
  return Object.entries(AGENT_MAPPINGS).reduce((acc, [name, mapping]) => {
    acc[name] = {
      description: mapping.description,
      keywords: mapping.keywords
    };
    return acc;
  }, {});
}

module.exports = {
  classifyIntent,
  classifyWithAI,
  getAvailableAgents,
  AGENT_MAPPINGS,
  // Legacy exports for backward compatibility
  findKeywordMatch,
  classifyFromContext
};