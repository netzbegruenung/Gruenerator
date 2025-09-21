/**
 * Information Request Handler for Grünerator Chat
 * Handles detection of missing information and generation of clarification questions
 */

const chatMemory = require('../../services/chatMemoryService');

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

module.exports = {
  handleInformationRequest,
  checkForMissingInformation,
  generateInformationQuestion,
  extractRequestedInformation,
  completePendingRequest
};