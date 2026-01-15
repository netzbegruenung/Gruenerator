/**
 * Intent Classifier for Grünerator Chat
 * Maps user messages to appropriate text generation agents
 */

import type {
  AgentMappings,
  ClassificationResult,
  ChatContext,
  AIWorkerPool,
  KeywordMatch,
  ContextClassification,
  AIClassificationResponse
} from './types.js';

// Agent mappings with routing information
export const AGENT_MAPPINGS: AgentMappings = {
  // Platform-specific social media agents
  'twitter': {
    route: 'social',
    keywords: ['tweet', 'twitter', 'x post', 'x.com', 'x-post', 'x-beitrag', 'x beitrag', 'twet', 'xpost'],
    description: 'Twitter/X posts with character limit (280 chars)',
    params: { platforms: ['twitter'] }
  },
  'instagram': {
    route: 'social',
    keywords: ['instagram', 'insta', 'ig post', 'ig-post', 'reel'],
    description: 'Instagram posts and captions',
    params: { platforms: ['instagram'] }
  },
  'facebook': {
    route: 'social',
    keywords: ['facebook', 'fb post', 'fb-post'],
    description: 'Facebook posts',
    params: { platforms: ['facebook'] }
  },
  'linkedin': {
    route: 'social',
    keywords: ['linkedin', 'berufsnetzwerk', 'karriere-post'],
    description: 'LinkedIn professional posts',
    params: { platforms: ['linkedin'] }
  },
  // Generic social media fallback (when no specific platform mentioned)
  'social_media': {
    route: 'social',
    keywords: ['social media', 'post', 'beitrag', 'social-media'],
    description: 'Generic social media posts (asks for platform or uses defaults)',
    params: {}
  },
  'pressemitteilung': {
    route: 'social',
    keywords: ['pressemitteilung', 'presse', 'medien', 'presseverteiler', 'journalisten', 'presseartikel', 'pm'],
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
    keywords: ['leichte sprache', 'einfach', 'verständlich', 'barrierefrei', 'übersetzen', 'vereinfachen', 'simpel'],
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
    keywords: ['sharepic', 'share-pic', 'bild erstellen', 'grafik erstellen', 'grafik', 'bildpost', 'socialmedia-bild'],
    description: 'AI-powered sharepic generation with default dreizeilen format',
    params: { type: 'dreizeilen' }
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
  'dreizeilen': {
    route: 'sharepic',
    keywords: ['dreizeilen', 'slogan', 'drei zeilen', 'dreizeilen sharepic', '3-zeilen', '3 zeilen', '3zeilen'],
    description: 'Three-line slogans for sharepics (requires image)',
    params: { type: 'dreizeilen' }
  },
  'dreizeilen_text_only': {
    route: 'sharepic',
    keywords: ['dreizeilen', 'slogan', 'drei zeilen'],
    description: 'Three-line slogans for sharepics (no image provided)',
    params: { type: 'dreizeilen' }
  },

  // FLUX/Imagine AI image generation
  'imagine': {
    route: 'imagine',
    keywords: ['bild mit titel', 'bild mit dem titel', 'bild erstellen', 'generiere bild', 'bild erzeugen', 'imagine', 'erstelle ein bild', 'erstelle ein foto', 'erstelle eine illustration', 'erstelle eine grafik', 'transformiere', 'begrüne', 'ki-bild', 'flux', 'illustriere', 'visualisiere', 'realistisches bild', 'realistisches foto', 'fotorealistisch', 'mache grün'],
    description: 'AI image generation with FLUX - pure images, sharepics with titles, or image transformation',
    params: {}
  }
};

/**
 * AI-powered multi-intent classification
 * Detects multiple intents in one message and supports parallel processing
 */
export async function classifyIntent(
  message: string,
  context: ChatContext = {},
  aiWorkerPool: AIWorkerPool | null = null
): Promise<ClassificationResult> {
  console.log('[IntentClassifier] Using AI-powered multi-intent classification:', message.substring(0, 100));

  // Step 1: Try AI-powered multi-intent detection first
  if (aiWorkerPool) {
    try {
      const aiResult = await classifyWithAI(message, context, aiWorkerPool);
      if (aiResult && aiResult.intents && aiResult.intents.length > 0) {
        const { requestType, subIntent, intents } = aiResult;
        console.log('[IntentClassifier] AI detected', intents.length, 'intents, requestType:', requestType, 'subIntent:', subIntent);

        // Force single universal intent for conversation requests
        if (requestType === 'conversation') {
          console.log('[IntentClassifier] Conversation detected - routing to conversation handler, subIntent:', subIntent);
          return {
            isMultiIntent: false,
            intents: [{ agent: 'conversation', route: 'conversation', params: {}, confidence: 0.9 }],
            method: 'ai',
            confidence: 0.9,
            requestType: 'conversation',
            subIntent: subIntent || 'general'
          };
        }

        return {
          isMultiIntent: intents.length > 1,
          intents: intents,
          method: 'ai',
          confidence: Math.max(...intents.map(i => i.confidence || 0.8)),
          requestType: requestType
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[IntentClassifier] AI classification failed, falling back:', errorMessage);
    }
  }

  // Step 2: Fallback to keyword-based detection (single intent)
  const normalizedMessage = message.toLowerCase().trim();
  const keywordMatch = findKeywordMatch(normalizedMessage);
  if (keywordMatch) {
    console.log('[IntentClassifier] Keyword fallback match:', keywordMatch.agent);

    // Upgrade zitat to zitat_with_image if image is present
    let agent = keywordMatch.agent;
    let params = keywordMatch.mapping.params;

    if (agent === 'zitat' && context.hasImageAttachment) {
      console.log('[IntentClassifier] Keyword fallback: Upgrading zitat to zitat_with_image due to image attachment');
      agent = 'zitat_with_image';
      params = { ...params, type: 'zitat' };
    }

    return {
      isMultiIntent: false,
      intents: [{
        agent: agent,
        route: keywordMatch.mapping.route,
        params: params,
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
 */
export function findKeywordMatch(normalizedMessage: string): KeywordMatch | null {
  // Collect all matches and prefer longer keywords for more specific matching
  const matches: KeywordMatch[] = [];

  for (const [agentName, mapping] of Object.entries(AGENT_MAPPINGS)) {
    for (const keyword of mapping.keywords) {
      if (normalizedMessage.includes(keyword)) {
        matches.push({
          agent: agentName,
          mapping: mapping,
          keyword: keyword,
          length: keyword.length
        });
      }
    }
  }

  if (matches.length === 0) return null;

  // Sort by keyword length descending - longer matches are more specific
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

/**
 * AI-powered multi-intent classification
 * Detects multiple intents in one message using structured output
 */
export async function classifyWithAI(
  message: string,
  context: ChatContext,
  aiWorkerPool: AIWorkerPool
): Promise<AIClassificationResponse | null> {
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

  const classificationPrompt = `${conversationContext}Analysiere diese neue Nachricht:
"${message}"${imageContext}

${context.lastAgent ? `Letzter verwendeter Agent: ${context.lastAgent}` : ''}
${context.topic ? `Aktuelles Thema: ${context.topic}` : ''}

SCHRITT 1 - REQUEST-TYP BESTIMMEN (WICHTIGSTER SCHRITT!):

1. "content_creation" - Benutzer will INHALT ERSTELLEN
   Signale: "erstelle", "mache", "schreibe", "generiere", Plattform-Namen, Format-Anfragen
   Beispiele: "Erstelle einen Tweet", "Mach ein Sharepic", "Schreib eine PM"

2. "document_query" - Benutzer fragt nach SEINEN Dokumenten/Texten
   Signale: "meine Dokumente", "in meinen Unterlagen", "was steht in", "habe ich", "such in meinen"
   Beispiele: "Was steht in meinem Klimadokument?", "Such in meinen Texten"

3. "conversation" - ALLGEMEINE Wissensfrage oder Chat (KEINE Inhaltserstellung!)
   Signale: Philosophische Fragen, wissenschaftliche Fragen, Smalltalk, Meinungsfragen
   Beispiele: "Was kam zuerst, Huhn oder Ei?", "Warum ist der Himmel blau?", "Was meinst du?"

SCHRITT 2 - AGENT BESTIMMEN:

Verfügbare Agenten:
${agentDescriptions}

REGELN:
- Bei "conversation" → NUR {"agent": "universal"}, NIEMALS mehrere Intents!
- Bei "document_query" → NUR {"agent": "universal"}
- Bei "content_creation" → passende Agents (social, sharepic, antrag, imagine, etc.)

SHAREPIC-SPEZIFISCHE REGELN (WICHTIG!):
- "zitat", "quote", "spruch", "aussage" → IMMER agent: "zitat" (NICHT dreizeilen!)
- "dreizeilen", "slogan", "drei zeilen", "3 zeilen" → agent: "dreizeilen"
- "info", "fakten", "information" → agent: "info"
- "sharepic" OHNE spezifischen Typ → agent: "sharepic_auto"
- Mit Bild + zitat → zitat_with_image
- Ohne Bild + zitat → zitat

BEISPIELE SHAREPIC:
- "Erstelle ein Zitat zum Thema Klimaschutz" → agent: "zitat" (NICHT dreizeilen!)
- "Mach einen Slogan über Windenergie" → agent: "dreizeilen"
- "Sharepic mit 3 Zeilen" → agent: "dreizeilen"
- "Quote von Annalena Baerbock" → agent: "zitat"

ANDERE REGELN:
- "bild erstellen", "generiere bild", "visualisiere", "illustriere", "flux", "ki-bild" → imagine
- Mit Bild + "transformiere"/"begrüne"/"bearbeite" → imagine (für Bildbearbeitung)
- Im Zweifel: "conversation" mit "universal" (weniger ist mehr!)

SCHRITT 3 - BEI CONVERSATION: SUB-INTENT BESTIMMEN

Wenn requestType "conversation" ist, bestimme auch den Sub-Intent:
- "summarize" - Benutzer will etwas zusammenfassen ("fasse zusammen", "kürze", "zusammenfassung")
- "translate" - Benutzer will übersetzen ("übersetze", "auf englisch", "ins deutsche")
- "compare" - Benutzer will vergleichen ("vergleiche", "unterschied zwischen", "was ist besser")
- "explain" - Benutzer will Erklärung ("erkläre", "was ist", "wie funktioniert")
- "brainstorm" - Benutzer will Ideen ("ideen für", "brainstorming", "vorschläge")
- "general" - Allgemeine Frage (Standard)

Beispiele für requestType:
- "Was kam zuerst, das Huhn oder das Ei?" → conversation, subIntent: general
- "Fasse diesen Text zusammen" → conversation, subIntent: summarize
- "Übersetze ins Englische" → conversation, subIntent: translate
- "Was ist besser, Solar oder Wind?" → conversation, subIntent: compare
- "Erkläre mir Photosynthese" → conversation, subIntent: explain
- "Ideen für Klimaschutz" → conversation, subIntent: brainstorm
- "Was steht in meinem Klimadokument?" → document_query
- "Erstelle einen Tweet über Klima" → content_creation, twitter
- "Sharepic und Instagram Post" → content_creation, [sharepic_auto, instagram]

Antworte als JSON:
{"requestType": "conversation|document_query|content_creation", "subIntent": "summarize|translate|compare|explain|brainstorm|general", "intents": [{"agent": "...", "confidence": 0.9}]}${context.singleIntentOnly ? '\n\nWICHTIG: Gib NUR EINEN Intent zurück - den besten Match! Keine mehreren Intents.' : ''}`;

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
    let parsedResponse: AIClassificationResponse | undefined;
    let parsedIntents: Array<{ agent: string; confidence?: number; params?: Record<string, unknown> }> = [];
    let requestType: 'conversation' | 'document_query' | 'content_creation' = 'content_creation';
    let subIntent: 'summarize' | 'translate' | 'compare' | 'explain' | 'brainstorm' | 'general' = 'general';

    try {
      // Try to parse as full JSON object first (new format)
      const jsonObjectMatch = result.content.match(/\{[\s\S]*"requestType"[\s\S]*\}/);
      if (jsonObjectMatch) {
        parsedResponse = JSON.parse(jsonObjectMatch[0]) as AIClassificationResponse;
        requestType = parsedResponse.requestType || 'content_creation';
        subIntent = parsedResponse.subIntent || 'general';
        parsedIntents = parsedResponse.intents || [];
        console.log('[IntentClassifier] Parsed requestType:', requestType, 'subIntent:', subIntent);
      } else {
        // Fallback: Try to extract JSON array (old format)
        const jsonArrayMatch = result.content.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          parsedIntents = JSON.parse(jsonArrayMatch[0]);
        } else {
          parsedIntents = JSON.parse(result.content);
        }
      }
    } catch (parseError) {
      console.warn('[IntentClassifier] Failed to parse AI response:', result.content);
      return null;
    }

    // Ensure we have an array
    if (!Array.isArray(parsedIntents)) {
      parsedIntents = [parsedIntents];
    }

    // Validate and enrich intents - pick only the highest confidence intent for sharepic requests
    let validIntents = parsedIntents
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

    // For sharepic intents, only keep the highest confidence one to avoid multi-intent confusion
    const sharepicAgents = ['zitat', 'zitat_with_image', 'dreizeilen', 'info', 'sharepic_auto', 'quote'];
    const sharepicIntents = validIntents.filter(i => sharepicAgents.includes(i.agent));
    if (sharepicIntents.length > 1) {
      // Sort by confidence and keep only the best one
      sharepicIntents.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      const bestSharepic = sharepicIntents[0];
      console.log('[IntentClassifier] Multiple sharepic intents detected, keeping best:', bestSharepic.agent);
      // Replace all sharepic intents with just the best one
      validIntents = validIntents.filter(i => !sharepicAgents.includes(i.agent));
      validIntents.push(bestSharepic);
    }

    if (validIntents.length === 0) {
      console.warn('[IntentClassifier] No valid intents found in AI response');
      return null;
    }

    // Post-process intents to upgrade zitat to zitat_with_image when images are present
    const hasImageAttachmentInContext = context.hasImageAttachment || false;
    const processedIntents = validIntents.map(intent => {
      if (intent.agent === 'zitat' && hasImageAttachmentInContext) {
        console.log('[IntentClassifier] Upgrading zitat to zitat_with_image due to image attachment');
        return {
          ...intent,
          agent: 'zitat_with_image',
          params: {
            ...intent.params,
            type: 'zitat'
          }
        };
      }
      return intent;
    });

    console.log('[IntentClassifier] AI successfully classified', processedIntents.length, 'intents:',
                processedIntents.map(i => i.agent), 'requestType:', requestType, 'subIntent:', subIntent);

    // Return requestType, subIntent, and intents
    return {
      requestType: requestType,
      subIntent: subIntent,
      intents: processedIntents
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[IntentClassifier] AI classification error:', errorMessage);
    return null;
  }
}

/**
 * Classify based on conversation context
 */
export function classifyFromContext(
  normalizedMessage: string,
  context: ChatContext
): ContextClassification | null {
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
      // Upgrade to zitat_with_image if image is present
      if (context.hasImageAttachment) {
        console.log('[IntentClassifier] Context classification: Upgrading zitat to zitat_with_image due to image attachment');
        return {
          agent: 'zitat_with_image',
          route: 'sharepic',
          params: { type: 'zitat' },
          confidence: 0.8
        };
      } else {
        return {
          agent: 'zitat',
          route: 'sharepic',
          params: { type: 'zitat_pure' },
          confidence: 0.8
        };
      }
    }
    if (normalizedMessage.includes('info')) {
      return {
        agent: 'info',
        route: 'sharepic',
        params: { type: 'info' },
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
 */
export function getAvailableAgents(): Record<string, { description: string; keywords: string[] }> {
  return Object.entries(AGENT_MAPPINGS).reduce((acc, [name, mapping]) => {
    acc[name] = {
      description: mapping.description,
      keywords: mapping.keywords
    };
    return acc;
  }, {} as Record<string, { description: string; keywords: string[] }>);
}

/**
 * Check if a message is a question (for web search detection)
 */
export function isQuestionMessage(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  // Ends with question mark
  if (normalized.endsWith('?')) return true;

  // Starts with German question words
  const questionStarters = [
    'wie ', 'was ', 'warum ', 'wo ', 'wann ', 'wer ',
    'welche ', 'welcher ', 'welches ', 'ob ', 'wieso ',
    'weshalb ', 'woher ', 'wohin ', 'womit '
  ];
  if (questionStarters.some(q => normalized.startsWith(q))) return true;

  // Contains question phrases
  const questionPhrases = [
    'kannst du mir sagen', 'weißt du', 'hast du informationen',
    'gibt es', 'was bedeutet', 'was ist'
  ];
  if (questionPhrases.some(p => normalized.includes(p))) return true;

  return false;
}
