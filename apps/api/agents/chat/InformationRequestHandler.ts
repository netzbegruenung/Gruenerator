/**
 * Information Request Handler for Grünerator Chat
 * Handles detection of missing information and generation of clarification questions
 */

import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import type { RequestType } from '../../config/antragQuestions.js';

/**
 * Type definitions
 */

export interface FieldConfig {
  field: string;
  displayName: string;
  questions?: string[];
  extractionPattern?: RegExp;
  generateDynamic?: boolean;
  maxQuestions?: number;
  questionTypes?: string[];
}

export interface RequiredFieldsConfig {
  [agent: string]: {
    [fieldKey: string]: FieldConfig;
  };
}

export interface MissingFieldInfo {
  field: string;
  fieldKey: string;
  displayName: string;
  questions: string[];
  extractionPattern?: RegExp;
}

export interface InformationRequestResponse {
  success: boolean;
  agent: string;
  content: {
    text: string;
    metadata: {
      requestType: string;
      missingField: string;
      fieldDisplayName: string;
    };
  };
  pendingRequest: PendingRequest;
}

export interface PendingRequest {
  type: string;
  agent: string;
  route?: string;
  params: Record<string, unknown>;
  missingField: string;
  extractionPattern?: RegExp;
  originalContext: RequestContext;
  classifiedIntent?: ClassifiedIntent;
}

export interface RequestContext {
  originalMessage?: string;
  message?: string;
  chatContext?: Record<string, unknown>;
  usePrivacyMode?: boolean;
  provider?: string | null;
  attachments?: unknown[];
  documentIds?: string[];
  [key: string]: unknown;
}

export interface ClassifiedIntent {
  agent: string;
  route?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StructuredAnswers {
  scope: string[];
  audience: string | null;
  facts: string[];
  tone: string | null;
  structure: string | null;
  clarifications: Array<string | { refersTo?: string; answer: string }>;
  raw: Record<string, string>;
}

export interface QuestionConfig {
  id: string;
  text: string;
  type: string;
  requiresText?: boolean;
  options?: string[];
  refersTo?: string;
}

export interface HandlerResult {
  type: 'request' | 'completion';
  data: InformationRequestResponse | RequestContext;
}

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
 */
export function isWebSearchConfirmation(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  if (WEBSEARCH_REJECTIONS.some(r => normalized.includes(r))) return false;
  return WEBSEARCH_CONFIRMATIONS.some(c => normalized.includes(c));
}

/**
 * Get a random web search question
 */
export function getWebSearchQuestion(): string {
  return WEBSEARCH_QUESTIONS[Math.floor(Math.random() * WEBSEARCH_QUESTIONS.length)];
}

/**
 * Required fields configuration for different intent types
 */
const REQUIRED_FIELDS: RequiredFieldsConfig = {
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
  'imagine': {
    'variant': {
      field: 'variant',
      displayName: 'Bildstil',
      questions: [
        'Welchen Bildstil möchtest du? Zur Auswahl stehen:\n• **Illustration** - Weiche, malerische Darstellung\n• **Realistisch** - Fotorealistischer Stil\n• **Pixel Art** - Retro-Gaming-Ästhetik\n• **Editorial** - Magazin-Qualität',
        'Bitte wähle einen Stil für dein Bild:\n1. Illustration (weich und malerisch)\n2. Realistisch (fotorealistisch)\n3. Pixel Art (Retro-Gaming)\n4. Editorial (Magazin-Look)'
      ]
    }
  }
};

/**
 * Check if extracted parameters are missing required fields
 */
export function checkForMissingInformation(
  agent: string,
  extractedParams: Record<string, unknown>,
  originalMessage: string
): MissingFieldInfo | null {
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
        questions: fieldConfig.questions ?? [],
        extractionPattern: fieldConfig.extractionPattern
      };
    }
  }

  return null;
}

/**
 * Generate a natural language question for missing information
 */
export function generateInformationQuestion(missingFieldInfo: MissingFieldInfo, context: Record<string, unknown> = {}): string {
  const { questions } = missingFieldInfo;

  if (!questions || questions.length === 0) {
    return `Bitte gib mir den Wert für ${missingFieldInfo.displayName}.`;
  }

  // Select a random question from the available options
  const selectedQuestion = questions[Math.floor(Math.random() * questions.length)];

  console.log('[InformationRequestHandler] Generated question:', selectedQuestion);
  return selectedQuestion;
}

/**
 * Create an information request response
 */
export function createInformationRequest(
  missingFieldInfo: MissingFieldInfo,
  originalRequest: RequestContext,
  classifiedIntent: ClassifiedIntent | null = null,
  context: Record<string, unknown> = {}
): InformationRequestResponse {
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
      agent: classifiedIntent?.agent || (originalRequest as any).agent,
      route: classifiedIntent?.route,
      params: classifiedIntent?.params || {},
      missingField: missingFieldInfo.field,
      extractionPattern: missingFieldInfo.extractionPattern,
      originalContext: originalRequest,
      // Store complete classified intent for restoration
      classifiedIntent: classifiedIntent || undefined
    }
  };
}

/**
 * Try to extract missing information from a user's response
 */
export function extractRequestedInformation(message: string, pendingRequest: PendingRequest): Record<string, string> | null {
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

  // Fallback: for thema field, use the message directly if it's not too long
  if (missingField === 'thema') {
    const trimmedMessage = message.trim();

    // Only accept 1-10 word responses (reasonable for a theme)
    const wordCount = trimmedMessage.split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 10) {
      console.log(`[InformationRequestHandler] Too many words for a theme (${wordCount}):`, trimmedMessage);
      return null;
    }

    if (trimmedMessage && trimmedMessage.length >= 3) {
      console.log(`[InformationRequestHandler] Extracted ${missingField} as theme:`, trimmedMessage);
      return {
        [missingField]: trimmedMessage
      };
    }
  }

  // Fallback: for variant fields (imagine image style), try keyword matching
  if (missingField === 'variant') {
    const lowerMessage = message.toLowerCase();

    // Map common responses to variant values
    const variantMappings: Record<string, string> = {
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
      const numberToVariant: Record<string, string> = {
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
 */
export function completePendingRequest(
  pendingRequest: PendingRequest,
  extractedInfo: Record<string, string>,
  req: RequestContext
): RequestContext {
  console.log('[InformationRequestHandler] Completing pending request with:', extractedInfo);

  const { originalContext, classifiedIntent } = pendingRequest;

  // Merge extracted information into original request with complete intent context
  const updatedRequest: RequestContext = {
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
    }, {} as Record<string, unknown>),
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
 */
export async function handleInformationRequest(
  userId: string,
  message: string,
  agent: string,
  extractedParams: Record<string, unknown>,
  originalRequest: RequestContext,
  classifiedIntent: ClassifiedIntent | null = null
): Promise<HandlerResult | null> {
  try {
    // Check if there's already a pending request
    const existingPendingRequest = await chatMemory.getPendingRequest(userId) as unknown as PendingRequest | null;

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[InformationRequestHandler] Error handling information request:', errorMessage);
    return null;
  }
}

/**
 * Generate questions for Antrag experimental flow
 * NOTE: This function is deprecated and kept for backward compatibility.
 * Questions are now loaded from predefined config in antragQuestions.js
 * @deprecated Use getQuestionsForType from config/antragQuestions.js instead
 */
export async function generateAntragQuestions(context: Record<string, unknown>, aiWorkerPool: unknown): Promise<QuestionConfig[]> {
  console.warn('[InformationRequestHandler] generateAntragQuestions is deprecated. Use getQuestionsForType from config/antragQuestions.js');

  const { getQuestionsForType } = await import('../../config/antragQuestions.js');
  const { requestType } = context;

  return getQuestionsForType(requestType as RequestType, 1);
}

/**
 * Fallback question generation when AI is unavailable
 */
function generateFallbackAntragQuestions(context: Record<string, unknown>): QuestionConfig[] {
  const { requestType } = context;

  const baseQuestions: QuestionConfig[] = [
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
 * @deprecated Use hasFollowUpQuestions from config/antragQuestions.js instead
 */
export async function analyzeAnswersForFollowup(
  questions: QuestionConfig[],
  answers: Record<string, string>,
  context: Record<string, unknown>,
  aiWorkerPool: unknown
): Promise<boolean> {
  console.warn('[InformationRequestHandler] analyzeAnswersForFollowup is deprecated. Use hasFollowUpQuestions from config/antragQuestions.js');

  const { hasFollowUpQuestions } = await import('../../config/antragQuestions.js');
  const { requestType } = context;

  return hasFollowUpQuestions(requestType as RequestType);
}

/**
 * Generate follow-up questions based on previous Q&A
 * NOTE: This function is deprecated. Follow-up questions are now predefined.
 * @deprecated Use getQuestionsForType(requestType, 2) from config/antragQuestions.js instead
 */
export async function generateFollowUpQuestions(context: Record<string, unknown>, aiWorkerPool: unknown): Promise<QuestionConfig[]> {
  console.warn('[InformationRequestHandler] generateFollowUpQuestions is deprecated. Use getQuestionsForType from config/antragQuestions.js');

  const { getQuestionsForType } = await import('../../config/antragQuestions.js');
  const { requestType } = context;

  return getQuestionsForType(requestType as RequestType, 2);
}

/**
 * Extract structured information from user answers
 */
export function extractStructuredAnswers(answers: Record<string, string>, questions: QuestionConfig[]): StructuredAnswers {
  const structured: StructuredAnswers = {
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
