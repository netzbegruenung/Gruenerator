/**
 * Information Request Handler for Grünerator Chat
 * Handles detection of missing information and generation of clarification questions
 */

const chatMemory = require('../../services/chatMemoryService');

/**
 * Web search confirmation detection
 */
const WEBSEARCH_CONFIRMATIONS = ['ja', 'bitte', 'gerne', 'ok', 'mach das', 'such', 'recherchiere', 'klar', 'sicher'];
const WEBSEARCH_REJECTIONS = ['nein', 'nicht', 'lass', 'abbrechen', 'cancel', 'stop', 'vergiss'];

/**
 * Question templates for offering web search
 */
const WEBSEARCH_QUESTIONS = [
  'Das kann ich leider nicht direkt beantworten. Soll ich im Internet danach suchen?',
  'Dazu habe ich keine Informationen. Möchtest du, dass ich eine Websuche durchführe?',
  'Diese Frage kann ich nicht aus meinem Wissen beantworten. Soll ich online recherchieren?'
];

/**
 * Check if user confirmed web search
 * @param {string} message - User message
 * @returns {boolean} True if confirmed, false if rejected or unclear
 */
function isWebSearchConfirmation(message) {
  const normalized = message.toLowerCase().trim();
  if (WEBSEARCH_REJECTIONS.some(r => normalized.includes(r))) return false;
  return WEBSEARCH_CONFIRMATIONS.some(c => normalized.includes(c));
}

/**
 * Get a random web search question
 * @returns {string} Question text
 */
function getWebSearchQuestion() {
  return WEBSEARCH_QUESTIONS[Math.floor(Math.random() * WEBSEARCH_QUESTIONS.length)];
}

/**
 * Required fields configuration for different intent types
 */
const REQUIRED_FIELDS = {
  'zitat': {
    'name': {
      field: 'name',
      displayName: 'Autor/Name',
      questions: [
        'Für das Zitat brauche ich noch den Namen des Autors. Wer hat das gesagt?',
        'Von wem stammt dieses Zitat? Bitte gib mir den Namen an.',
        'Um das Zitat zu vervollständigen, benötige ich noch den Autorennamen. Wie heißt die Person?'
      ],
      extractionPattern: /(?:von|autor|name:?\s*)([a-züäöß\s-]+)/i
    }
  },
  'zitat_pure': {
    'name': {
      field: 'name',
      displayName: 'Autor/Name',
      questions: [
        'Für das Zitat brauche ich noch den Namen des Autors. Wer hat das gesagt?',
        'Von wem stammt dieses Zitat? Bitte gib mir den Namen an.',
        'Um das Zitat zu vervollständigen, benötige ich noch den Autorennamen. Wie heißt die Person?'
      ],
      extractionPattern: /(?:von|autor|name:?\s*)([a-züäöß\s-]+)/i
    }
  },
  'zitat_with_image': {
    'name': {
      field: 'name',
      displayName: 'Autor/Name',
      questions: [
        'Für das Zitat brauche ich noch den Namen des Autors. Wer hat das gesagt?',
        'Von wem stammt dieses Zitat? Bitte gib mir den Namen an.',
        'Um das Zitat zu vervollständigen, benötige ich noch den Autorennamen. Wie heißt die Person?'
      ],
      extractionPattern: /(?:von|autor|name:?\s*)([a-züäöß\s-]+)/i
    }
  },
  'dreizeilen': {
    'thema': {
      field: 'thema',
      displayName: 'Thema',
      questions: [
        'Zu welchem Thema soll ich den Dreizeilen-Slogan erstellen?',
        'Welches Thema soll der Slogan behandeln?',
        'Über welches Thema soll der Dreizeilen-Text gehen?'
      ],
      extractionPattern: /(?:thema|über|zum thema|bezüglich:?\s*)([a-züäöß\s-]+)/i
    }
  },
  // FLUX/Imagine image generation - variant selection
  'imagine': {
    'variant': {
      field: 'variant',
      displayName: 'Bildstil',
      questions: [
        'Welchen Bildstil möchtest du? Zur Auswahl stehen:\n• **Illustration** - Weiche, malerische Darstellung\n• **Realistisch** - Fotorealistischer Stil\n• **Pixel Art** - Retro-Gaming-Ästhetik\n• **Editorial** - Magazin-Qualität',
        'In welchem Stil soll das Bild erstellt werden? (Illustration, Realistisch, Pixel Art, oder Editorial)',
        'Welche Bildästhetik bevorzugst du? Illustration (weich/malerisch), Realistisch (Foto), Pixel Art (Retro), oder Editorial (Magazin)?'
      ],
      extractionPattern: /(?:illustration|realistisch|foto|pixel(?:\s*art)?|editorial|magazin|zeichnung|aquarell|malerisch)/i,
      options: ['illustration', 'realistisch', 'pixel', 'editorial']
    }
  }
  // Can be extended for other intents like 'pressemitteilung' requiring spokesman names, etc.
};

/**
 * Check if an intent requires specific information and if it's missing
 * @param {string} agent - The agent/intent type
 * @param {object} extractedParams - Parameters extracted from the message
 * @param {string} originalMessage - Original user message
 * @returns {object|null} Missing field info or null if all required fields present
 */
function checkForMissingInformation(agent, extractedParams, originalMessage) {
  console.log('[InformationRequestHandler] Checking for missing info:', { agent, extractedParams });

  const requiredFields = REQUIRED_FIELDS[agent];
  if (!requiredFields) {
    // No special requirements for this agent
    return null;
  }

  // Check each required field
  for (const [fieldKey, fieldConfig] of Object.entries(requiredFields)) {
    const fieldValue = extractedParams[fieldConfig.field];

    // Check if field is missing or empty
    if (!fieldValue || (typeof fieldValue === 'string' && !fieldValue.trim()) || fieldValue === 'Unbekannt') {
      console.log(`[InformationRequestHandler] Missing required field: ${fieldKey}`);

      return {
        field: fieldConfig.field,
        fieldKey: fieldKey,
        displayName: fieldConfig.displayName,
        questions: fieldConfig.questions,
        extractionPattern: fieldConfig.extractionPattern
      };
    }
  }

  return null;
}

/**
 * Generate a natural language question for missing information
 * @param {object} missingFieldInfo - Information about the missing field
 * @param {object} context - Chat context for personalization
 * @returns {string} Generated question
 */
function generateInformationQuestion(missingFieldInfo, context = {}) {
  const { questions } = missingFieldInfo;

  // Select a random question from the available options
  const selectedQuestion = questions[Math.floor(Math.random() * questions.length)];

  console.log('[InformationRequestHandler] Generated question:', selectedQuestion);
  return selectedQuestion;
}

/**
 * Create an information request response
 * @param {object} missingFieldInfo - Info about missing field
 * @param {object} originalRequest - Original request context to store
 * @param {object} classifiedIntent - Complete classified intent information
 * @param {object} context - Chat context
 * @returns {object} Information request response
 */
function createInformationRequest(missingFieldInfo, originalRequest, classifiedIntent = null, context = {}) {
  const question = generateInformationQuestion(missingFieldInfo, context);

  return {
    success: true,
    agent: 'information_request',
    content: {
      text: question,
      metadata: {
        requestType: 'information_request',
        missingField: missingFieldInfo.field,
        fieldDisplayName: missingFieldInfo.displayName
      }
    },
    pendingRequest: {
      type: 'missing_information',
      agent: classifiedIntent?.agent || originalRequest.agent,
      route: classifiedIntent?.route,
      params: classifiedIntent?.params || {},
      missingField: missingFieldInfo.field,
      extractionPattern: missingFieldInfo.extractionPattern,
      originalContext: originalRequest,
      // Store complete classified intent for restoration
      classifiedIntent: classifiedIntent
    }
  };
}

/**
 * Try to extract missing information from a user's response
 * @param {string} message - User's message
 * @param {object} pendingRequest - The pending request information
 * @returns {object|null} Extracted information or null if not found
 */
function extractRequestedInformation(message, pendingRequest) {
  console.log('[InformationRequestHandler] Attempting to extract info from:', message);

  const { missingField, extractionPattern } = pendingRequest;

  // Try pattern-based extraction first
  if (extractionPattern) {
    const match = message.match(extractionPattern);
    if (match && match[1]) {
      const extractedValue = match[1].trim();
      console.log(`[InformationRequestHandler] Extracted ${missingField} via pattern:`, extractedValue);
      return {
        [missingField]: extractedValue
      };
    }
  }

  // Fallback: for name fields, try simple heuristics
  if (missingField === 'name') {
    // Remove common prefixes and use the remaining text as name
    const cleanedMessage = message
      .replace(/^(das war|das ist|von|autor|name:?\s*)/i, '')
      .replace(/^(es war|gesagt von|stammt von)\s+/i, '')
      .trim();

    // Reject if it contains command keywords
    const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere', 'sharepic', 'zitat', 'thema'];
    if (commandKeywords.some(keyword => cleanedMessage.toLowerCase().includes(keyword))) {
      console.log(`[InformationRequestHandler] Message contains commands, not a name:`, cleanedMessage);
      return null;
    }

    // Only accept 1-4 word responses (reasonable for names)
    const wordCount = cleanedMessage.split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 4) {
      console.log(`[InformationRequestHandler] Too many words for a name (${wordCount}):`, cleanedMessage);
      return null;
    }

    // Check if it looks like a name (contains letters, reasonable length)
    if (cleanedMessage && /^[a-züäöß\s.-]{2,50}$/i.test(cleanedMessage)) {
      console.log(`[InformationRequestHandler] Extracted ${missingField} via heuristics:`, cleanedMessage);
      return {
        [missingField]: cleanedMessage
      };
    }
  }

  // Fallback: for thema fields, try simple heuristics
  if (missingField === 'thema') {
    // Remove common prefixes and use the remaining text as theme
    const cleanedMessage = message
      .replace(/^(das thema ist|thema:?\s*|über|zum thema|bezüglich)\s*/i, '')
      .trim();

    // Reject if it contains command keywords that indicate a new request
    const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere'];
    if (commandKeywords.some(keyword => cleanedMessage.toLowerCase().includes(keyword))) {
      console.log(`[InformationRequestHandler] Message contains commands, not a theme:`, cleanedMessage);
      return null;
    }

    // Accept 1-8 word responses (reasonable for themes)
    const wordCount = cleanedMessage.split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 8) {
      console.log(`[InformationRequestHandler] Too many words for a theme (${wordCount}):`, cleanedMessage);
      return null;
    }

    // Check if it looks like a theme (contains letters, reasonable length)
    if (cleanedMessage && /^[a-züäöß\s.-]{2,100}$/i.test(cleanedMessage)) {
      console.log(`[InformationRequestHandler] Extracted ${missingField} via heuristics:`, cleanedMessage);
      return {
        [missingField]: cleanedMessage
      };
    }
  }

  // Fallback: for variant fields (imagine image style), try keyword matching
  if (missingField === 'variant') {
    const lowerMessage = message.toLowerCase();

    // Map common responses to variant values
    const variantMappings = {
      'illustration': 'illustration-pure',
      'zeichnung': 'illustration-pure',
      'aquarell': 'illustration-pure',
      'malerisch': 'illustration-pure',
      'realistisch': 'realistic-pure',
      'foto': 'realistic-pure',
      'fotorealistisch': 'realistic-pure',
      'pixel': 'pixel-pure',
      'pixel art': 'pixel-pure',
      'pixelart': 'pixel-pure',
      'retro': 'pixel-pure',
      '16-bit': 'pixel-pure',
      'editorial': 'editorial-pure',
      'magazin': 'editorial-pure'
    };

    for (const [keyword, variantValue] of Object.entries(variantMappings)) {
      if (lowerMessage.includes(keyword)) {
        console.log(`[InformationRequestHandler] Extracted variant via keyword "${keyword}":`, variantValue);
        return {
          [missingField]: variantValue
        };
      }
    }

    // Check for numbered responses (1, 2, 3, 4)
    const numberMatch = message.match(/^[1-4]$/);
    if (numberMatch) {
      const numberToVariant = {
        '1': 'illustration-pure',
        '2': 'realistic-pure',
        '3': 'pixel-pure',
        '4': 'editorial-pure'
      };
      const variantValue = numberToVariant[numberMatch[0]];
      console.log(`[InformationRequestHandler] Extracted variant via number selection:`, variantValue);
      return {
        [missingField]: variantValue
      };
    }
  }

  console.log(`[InformationRequestHandler] Could not extract ${missingField} from message`);
  return null;
}

/**
 * Complete a pending request with provided information
 * @param {object} pendingRequest - The pending request
 * @param {object} extractedInfo - Information extracted from user message
 * @param {object} req - Express request object
 * @returns {object} Updated request context ready for processing
 */
function completePendingRequest(pendingRequest, extractedInfo, req) {
  console.log('[InformationRequestHandler] Completing pending request with:', extractedInfo);

  const { originalContext, classifiedIntent } = pendingRequest;

  // Merge extracted information into original request with complete intent context
  const updatedRequest = {
    ...originalContext,
    // Restore complete classified intent information
    agent: pendingRequest.agent,
    route: pendingRequest.route,
    params: { ...pendingRequest.params },
    classifiedIntent: classifiedIntent,
    // Update parameters with extracted information
    ...Object.keys(extractedInfo || {}).reduce((acc, key) => {
      acc[key] = extractedInfo[key];
      return acc;
    }, {}),
    // Preserve original message and context with safe defaults
    originalMessage: originalContext?.originalMessage || originalContext?.message || '',
    chatContext: originalContext?.chatContext || {},
    usePrivacyMode: originalContext?.usePrivacyMode || false,
    provider: originalContext?.provider || null,
    attachments: originalContext?.attachments || [],
    documentIds: originalContext?.documentIds || []
  };

  console.log('[InformationRequestHandler] Updated request context with complete intent:', {
    agent: updatedRequest.agent,
    route: updatedRequest.route,
    hasParams: !!updatedRequest.params,
    extractedFields: Object.keys(extractedInfo || {})
  });

  return updatedRequest;
}

/**
 * Main handler function to process information requests
 * @param {string} userId - User ID
 * @param {string} message - User message
 * @param {string} agent - Intent agent
 * @param {object} extractedParams - Extracted parameters
 * @param {object} originalRequest - Original request context
 * @param {object} classifiedIntent - Complete classified intent information
 * @returns {Promise<object|null>} Information request response or null
 */
async function handleInformationRequest(userId, message, agent, extractedParams, originalRequest, classifiedIntent = null) {
  try {
    // Check if there's already a pending request
    const existingPendingRequest = await chatMemory.getPendingRequest(userId);

    if (existingPendingRequest && existingPendingRequest.type === 'missing_information') {
      console.log('[InformationRequestHandler] Found existing pending request, attempting to resolve');

      // Try to extract the requested information from the current message
      const extractedInfo = extractRequestedInformation(message, existingPendingRequest);

      if (extractedInfo) {
        // Information found! Clear pending request and return updated context
        await chatMemory.clearPendingRequest(userId);

        const completedRequest = completePendingRequest(existingPendingRequest, extractedInfo, originalRequest);
        return {
          type: 'completion',
          data: completedRequest
        };
      } else {
        // Information still not provided, ask again (but don't create duplicate pending request)
        console.log('[InformationRequestHandler] Information still missing, will ask again');
        return null; // Let normal processing handle this as a new request
      }
    }

    // Check if current request is missing required information
    const missingFieldInfo = checkForMissingInformation(agent, extractedParams, message);

    if (missingFieldInfo) {
      console.log('[InformationRequestHandler] Missing information detected, creating request');

      // Create information request with complete classified intent
      const informationRequest = createInformationRequest(missingFieldInfo, originalRequest, classifiedIntent);

      // Store pending request in memory
      await chatMemory.setPendingRequest(userId, informationRequest.pendingRequest);

      return {
        type: 'request',
        data: informationRequest
      };
    }

    // All required information is present
    return null;

  } catch (error) {
    console.error('[InformationRequestHandler] Error handling information request:', error);
    return null;
  }
}

/**
 * Generate questions for Antrag experimental flow
 * NOTE: This function is deprecated and kept for backward compatibility.
 * Questions are now loaded from predefined config in antragQuestions.js
 * @param {object} context - { thema, details, searchResults, requestType }
 * @param {object} aiWorkerPool - AI worker pool instance (unused)
 * @returns {Promise<array>} Array of predefined questions
 * @deprecated Use getQuestionsForType from config/antragQuestions.js instead
 */
async function generateAntragQuestions(context, aiWorkerPool) {
  console.warn('[InformationRequestHandler] generateAntragQuestions is deprecated. Use getQuestionsForType from config/antragQuestions.js');

  const { getQuestionsForType } = require('../../config/antragQuestions.js');
  const { requestType } = context;

  return getQuestionsForType(requestType, 1);
}

/**
 * Fallback question generation when AI is unavailable
 * @param {object} context - Question generation context
 * @returns {array} Fallback questions
 */
function generateFallbackAntragQuestions(context) {
  const { requestType } = context;

  const baseQuestions = [
    {
      id: 'q1',
      text: 'Welche spezifischen Aspekte sollen im Vordergrund stehen?',
      type: 'scope',
      requiresText: true
    },
    {
      id: 'q2',
      text: 'An welches Gremium richtet sich der Antrag?',
      type: 'audience',
      options: ['Gemeinderat', 'Stadtrat', 'Ausschuss', 'Anderes']
    },
    {
      id: 'q3',
      text: 'Welche Tonalität bevorzugst du?',
      type: 'tone',
      options: ['Sachlich-neutral', 'Appellativ', 'Fachlich-detailliert']
    }
  ];

  if (requestType === 'kleine_anfrage' || requestType === 'grosse_anfrage') {
    baseQuestions.push({
      id: 'q4',
      text: 'Auf welche konkreten Informationen/Daten wartest du als Antwort?',
      type: 'facts',
      requiresText: true
    });
  }

  console.log('[InformationRequestHandler] Using fallback questions');
  return baseQuestions.slice(0, 4);
}

/**
 * Analyze answers to determine if follow-up questions are needed
 * NOTE: This function is deprecated. Follow-up logic is now rule-based.
 * @param {array} questions - Original questions with metadata (unused)
 * @param {object} answers - User's answers keyed by question ID (unused)
 * @param {object} context - Full context including thema, details
 * @param {object} aiWorkerPool - AI worker pool instance (unused)
 * @returns {Promise<boolean>} True if follow-up needed
 * @deprecated Use hasFollowUpQuestions from config/antragQuestions.js instead
 */
async function analyzeAnswersForFollowup(questions, answers, context, aiWorkerPool) {
  console.warn('[InformationRequestHandler] analyzeAnswersForFollowup is deprecated. Use hasFollowUpQuestions from config/antragQuestions.js');

  const { hasFollowUpQuestions } = require('../../config/antragQuestions.js');
  const { requestType } = context;

  return hasFollowUpQuestions(requestType);
}

/**
 * Generate follow-up questions based on previous Q&A
 * NOTE: This function is deprecated. Follow-up questions are now predefined.
 * @param {object} context - Full context including previous questions and answers
 * @param {object} aiWorkerPool - AI worker pool instance (unused)
 * @returns {Promise<array>} Array of predefined follow-up questions
 * @deprecated Use getQuestionsForType(requestType, 2) from config/antragQuestions.js instead
 */
async function generateFollowUpQuestions(context, aiWorkerPool) {
  console.warn('[InformationRequestHandler] generateFollowUpQuestions is deprecated. Use getQuestionsForType from config/antragQuestions.js');

  const { getQuestionsForType } = require('../../config/antragQuestions.js');
  const { requestType } = context;

  return getQuestionsForType(requestType, 2);
}

/**
 * Extract structured information from user answers
 * @param {object} answers - Raw user answers keyed by question ID
 * @param {array} questions - Original questions with metadata
 * @returns {object} Structured extracted information
 */
function extractStructuredAnswers(answers, questions) {
  const structured = {
    scope: [],
    audience: null,
    facts: [],
    tone: null,
    structure: null,
    clarifications: [],
    raw: answers
  };

  // Group answers by question type
  questions.forEach(q => {
    const answer = answers[q.id];
    if (!answer) return;

    switch (q.type) {
      case 'scope':
        structured.scope.push(answer);
        break;
      case 'audience':
        structured.audience = answer;
        break;
      case 'facts':
        structured.facts.push(answer);
        break;
      case 'tone':
        structured.tone = answer;
        break;
      case 'structure':
        structured.structure = answer;
        break;
      case 'clarification':
        structured.clarifications.push({
          refersTo: q.refersTo,
          answer: answer
        });
        break;
      default:
        structured.clarifications.push(answer);
    }
  });

  // Clean up arrays
  structured.scope = structured.scope.filter(Boolean);
  structured.facts = structured.facts.filter(Boolean);
  structured.clarifications = structured.clarifications.filter(Boolean);

  console.log('[InformationRequestHandler] Extracted structured answers:', {
    hasScope: structured.scope.length > 0,
    hasAudience: !!structured.audience,
    hasFacts: structured.facts.length > 0,
    hasTone: !!structured.tone,
    hasClarifications: structured.clarifications.length > 0
  });

  return structured;
}

// Add to REQUIRED_FIELDS for experimental Antrag flow
REQUIRED_FIELDS['antrag_experimental'] = {
  'clarifications': {
    field: 'clarifications',
    displayName: 'Verständnisfragen',
    generateDynamic: true,
    maxQuestions: 5,
    questionTypes: ['scope', 'audience', 'facts', 'tone', 'structure']
  }
};

module.exports = {
  handleInformationRequest,
  checkForMissingInformation,
  generateInformationQuestion,
  extractRequestedInformation,
  completePendingRequest,
  // New exports for Antrag experimental flow
  generateAntragQuestions,
  analyzeAnswersForFollowup,
  generateFollowUpQuestions,
  extractStructuredAnswers,
  // Web search confirmation exports
  isWebSearchConfirmation,
  getWebSearchQuestion
};