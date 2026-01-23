/**
 * Simplified Interactive Generator
 *
 * A lightweight two-call pattern for interactive text generation:
 * 1. initiateInteractiveGenerator - Generate questions from user input only
 * 2. continueInteractiveGenerator - Process answers, optionally web search, generate result
 *
 * No LangGraph complexity - just Redis sessions and direct AI calls.
 *
 * To add a new generator type:
 * 1. Create prompts/interactive_questions_{type}.json
 * 2. Create prompts/{type}_experimental.json
 * 3. Call with generatorType: '{type}'
 */

import type { Request } from 'express';
import type {
  AIWorkerPool,
  AIWorkerRequest,
  AIWorkerResponse,
  GeneratedQuestion,
  QuestionGenerationArgs,
  QuestionGenerationResult,
  QuestionGenerationState,
  QuestionAnswers,
  StructuredAnswers,
  WebSearchResult,
  SearxngService,
  EnrichmentRequest,
  EnrichedContext,
  PromptContext,
  AssembledPromptResult,
  GenerationResult,
  InteractiveSession,
  InitiateGeneratorParams,
  InitiateGeneratorResult,
  ContinueGeneratorParams,
  ContinueGeneratorResult,
  GenerateFinalResultParams,
  GeneratorConfig,
  Locale
} from './types/index.js';
import type { ExperimentalSession } from '../../services/chat/types.js';
import type { PromptConfig } from './types/promptProcessor.js';

import {
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession
} from '../../services/chat/ChatMemoryService.js';
import { loadPromptConfig, SimpleTemplateEngine } from './PromptProcessor.js';
import { getQuestionsForType } from '../../config/antragQuestions.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';

// Lazy-loaded optional services
let _searxngService: SearxngService | null = null;
let _searxngLoaded = false;

/**
 * Lazy load SearxngService
 */
async function getSearxngService(): Promise<SearxngService | null> {
  if (!_searxngLoaded) {
    _searxngLoaded = true;
    try {
      const mod = await import('../../services/search/index.js');
      _searxngService = mod.searxngService;
    } catch (_) {
      _searxngService = null;
    }
  }
  return _searxngService;
}

/**
 * Generate clarifying questions using AI based on user input only
 */
async function generateClarifyingQuestions(
  state: QuestionGenerationState
): Promise<QuestionGenerationResult> {
  const generatorType = state.generatorType || 'antrag';
  const config = loadPromptConfig(`interactive_questions_${generatorType}`) as PromptConfig & {
    systemPrompt: string;
    generationPrompt: string;
    toolSchema: any;
    questionDefaults?: {
      questionFormat?: 'multiple_choice' | 'text' | 'number';
      allowCustom?: boolean;
      allowMultiSelect?: boolean;
      skipOption?: string | boolean;
    };
  };

  const userPrompt = SimpleTemplateEngine.render(config.generationPrompt, {
    inhalt: state.inhalt,
    requestType: state.requestType,
    searchSummary: 'Keine Suchergebnisse verfügbar.'
  });

  const tools = [config.toolSchema];

  console.log(`[SimpleInteractiveGenerator] Generating questions for ${generatorType}...`);

  const result = await state.aiWorkerPool.processRequest(
    {
      type: 'antrag_question_generation',
      systemPrompt: config.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      options: {
        ...config.options,
        tools
      }
    } as AIWorkerRequest,
    state.req
  );

  if (result.tool_calls && result.tool_calls.length > 0) {
    const toolCall = result.tool_calls[0];
    const functionArgs =
      typeof toolCall.input === 'string'
        ? JSON.parse(toolCall.input)
        : toolCall.input;

    // Type guard for QuestionGenerationArgs
    if (!functionArgs || typeof functionArgs !== 'object' || !('needsClarification' in functionArgs)) {
      console.warn('[SimpleInteractiveGenerator] Invalid tool call response format');
      return { needsClarification: false, questions: [], confidenceReason: 'Invalid response format' };
    }

    const typedArgs = functionArgs as QuestionGenerationArgs;

    // Check if AI decided clarification is needed
    const needsClarification = typedArgs.needsClarification;
    const confidenceReason = typedArgs.confidenceReason || '';


    if (!needsClarification || !typedArgs.questions || typedArgs.questions.length === 0) {
      console.log(`[SimpleInteractiveGenerator] AI decided no questions needed: ${confidenceReason}`);
      return { needsClarification: false, questions: [], confidenceReason };
    }

    const questions: GeneratedQuestion[] = typedArgs.questions.map((q, index) => ({
      id: q.id || `q${index + 1}`,
      text: q.text,
      type: 'ai_generated',
      uncertainty: q.uncertainty,
      questionFormat: config.questionDefaults?.questionFormat || 'multiple_choice',
      options: q.options,
      optionEmojis: q.emojis,
      allowCustom: config.questionDefaults?.allowCustom ?? true,
      allowMultiSelect: config.questionDefaults?.allowMultiSelect ?? false,
      skipOption: config.questionDefaults?.skipOption
    }));

    console.log(`[SimpleInteractiveGenerator] Generated ${questions.length} AI questions`);
    return { needsClarification: true, questions, confidenceReason };
  }

  console.warn('[SimpleInteractiveGenerator] AI question generation failed, proceeding without questions');
  return { needsClarification: false, questions: [], confidenceReason: 'AI response failed' };
}

/**
 * Format Q&A pairs directly (no AI summarization needed for short answers)
 */
function formatQAPairs(questions: GeneratedQuestion[], answers: QuestionAnswers): string {
  const pairs = questions
    .filter(q => answers[q.id] && answers[q.id] !== 'Überspringen')
    .map(q => `- ${q.text}: ${answers[q.id]}`)
    .join('\n');

  if (!pairs) {
    return '';
  }

  return `## Antworten aus dem Verständnisgespräch\n\n${pairs}`;
}

/**
 * Perform web search if enabled
 */
async function performWebSearch(state: {
  inhalt: string;
  locale: string;
}): Promise<WebSearchResult | null> {
  const searxngService = await getSearxngService();
  if (!searxngService) {
    console.log('[SimpleInteractiveAntrag] Web search service not available');
    return null;
  }

  console.log('[SimpleInteractiveAntrag] Performing web search...');

  try {
    const searchQuery = `${state.inhalt} Bündnis 90 Die Grünen`;
    const result = await searxngService.performWebSearch(searchQuery, {
      maxResults: 10,
      language: state.locale || 'de-DE'
    });

    if (result.success && result.results) {
      console.log(`[SimpleInteractiveAntrag] Web search found ${result.results.length} results`);
      return {
        results: result.results,
        sources: result.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content_snippets || r.snippet || ''
        }))
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[SimpleInteractiveAntrag] Web search failed:', errorMessage);
  }

  return null;
}

/**
 * Extract structured answers for enrichment
 */
function extractStructuredAnswers(
  answers: QuestionAnswers,
  questions: GeneratedQuestion[]
): StructuredAnswers {
  const structured: StructuredAnswers = {
    scope: [],
    audience: null,
    tone: null,
    facts: [],
    structure: null,
    actionType: null,
    painPoint: null,
    beneficiaries: [],
    budget: null,
    history: null,
    urgency: null
  };

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer || answer === 'Überspringen') continue;

    switch (q.type) {
      case 'action_type':
        structured.actionType = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'pain_point':
        structured.painPoint = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'beneficiaries':
        structured.beneficiaries = Array.isArray(answer) ? answer : [answer];
        break;
      case 'budget':
        structured.budget = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'history':
        structured.history = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'urgency':
        structured.urgency = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'scope':
        structured.scope.push(Array.isArray(answer) ? answer[0] : answer);
        break;
      case 'audience':
        structured.audience = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'tone':
        structured.tone = Array.isArray(answer) ? answer[0] : answer;
        break;
      case 'facts':
        structured.facts.push(Array.isArray(answer) ? answer[0] : answer);
        break;
      case 'structure':
        structured.structure = Array.isArray(answer) ? answer[0] : answer;
        break;
    }
  }

  return structured;
}

/**
 * INITIATE: Start interactive session, generate questions OR direct result
 * Returns questions if AI needs clarification, otherwise generates result directly
 */
export async function initiateInteractiveGenerator({
  userId,
  inhalt,
  requestType,
  generatorType = 'antrag',
  locale = 'de-DE',
  aiWorkerPool,
  req
}: InitiateGeneratorParams): Promise<InitiateGeneratorResult> {
  console.log(`[SimpleInteractiveGenerator] Initiating ${generatorType} session`);

  const sessionId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Validate input
    if (!inhalt || !requestType) {
      throw new Error('Missing required fields: inhalt, requestType');
    }
    if (!userId) {
      throw new Error('Missing userId');
    }

    // Generate questions from user input only (no web search)
    const result = await generateClarifyingQuestions({
      inhalt,
      requestType,
      generatorType,
      locale,
      aiWorkerPool,
      req
    });

    // If AI is confident, generate result directly without questions
    if (!result.needsClarification) {
      console.log(`[SimpleInteractiveGenerator] AI confident, generating directly`);

      // Generate result directly
      const finalResult = await generateFinalResult({
        userId,
        sessionId,
        inhalt,
        requestType,
        generatorType,
        locale,
        questions: [],
        answers: {},
        aiWorkerPool,
        req
      });

      return {
        status: 'completed',
        sessionId,
        conversationState: 'completed',
        finalResult: finalResult.content,
        questions: [],
        questionRound: 0,
        metadata: {
          skippedQuestions: true,
          confidenceReason: result.confidenceReason
        }
      };
    }

    // Store session in Redis with questions
    const sessionData: InteractiveSession = {
      sessionId,
      conversationState: 'questions_asked',
      inhalt,
      requestType,
      generatorType,
      locale,
      questionRound: 1,
      questions: result.questions,
      answers: {},
      metadata: {
        startTime: Date.now(),
        confidenceReason: result.confidenceReason
      }
    };

    await setExperimentalSession(userId, sessionData);

    console.log(`[SimpleInteractiveGenerator] Session created: ${sessionId}, ${result.questions.length} questions`);

    return {
      status: 'success',
      sessionId,
      conversationState: 'questions_asked',
      questions: result.questions,
      questionRound: 1,
      metadata: {
        questionCount: result.questions.length
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[SimpleInteractiveGenerator] Initiate error:', error);
    return {
      status: 'error',
      sessionId,
      conversationState: 'questions_asked',
      message: 'Fehler beim Starten der interaktiven Erstellung',
      error: errorMessage
    };
  }
}

/**
 * Helper: Generate final result with optional Q&A context
 */
async function generateFinalResult({
  userId,
  sessionId,
  inhalt,
  requestType,
  generatorType = 'antrag',
  locale = 'de-DE',
  questions = [],
  answers = {},
  aiWorkerPool,
  req
}: GenerateFinalResultParams): Promise<GenerationResult> {
  // Format Q&A pairs if present
  const formattedQA = questions.length > 0 ? formatQAPairs(questions, answers) : '';

  // Check if web search is enabled
  const useWebSearch = req.body?.useWebSearch ?? false;
  let searchResults: WebSearchResult | null = null;

  if (useWebSearch) {
    searchResults = await performWebSearch({ inhalt, locale });
  }

  // Load config for final generation (dynamic based on generator type)
  const config = loadPromptConfig(`${generatorType}_experimental`) as GeneratorConfig;

  // Build system role
  let systemRole = config.systemRole || 'Du bist ein Experte bei Bündnis 90/Die Grünen.';
  if (config.systemRoleExtensions) {
    const extension = config.systemRoleExtensions[requestType] || config.systemRoleExtensions.default;
    if (extension) {
      systemRole += ' ' + extension;
    }
  }
  if (config.systemRoleAppendix) {
    systemRole += ' ' + config.systemRoleAppendix;
  }

  // Extract structured answers if present
  const structuredAnswers = questions.length > 0
    ? extractStructuredAnswers(answers, questions)
    : {} as StructuredAnswers;

  // Build enrichment request
  const enrichmentRequest: EnrichmentRequest = {
    inhalt,
    requestType,
    userClarifications: structuredAnswers
  };

  // Apply document enrichment
  // Note: enrichRequest returns EnrichedState which has a different document format,
  // but we only use the knowledge array from it, so the cast is safe
  const enrichedContext = await enrichRequest(enrichmentRequest, {}) as unknown as EnrichedContext;

  // Build knowledge array
  const knowledgeItems: string[] = [];

  if (formattedQA) {
    knowledgeItems.push(formattedQA);
  }

  if ((enrichedContext?.knowledge?.length ?? 0) > 0) {
    knowledgeItems.push(...(enrichedContext.knowledge ?? []));
  }

  if ((searchResults?.sources?.length ?? 0) > 0) {
    knowledgeItems.push(...(searchResults?.sources ?? []).map(s => `${s.title}: ${s.snippet}`).slice(0, 5));
  }

  console.log(`[SimpleInteractiveGenerator] Knowledge items: ${knowledgeItems.length}`);

  // Prepare prompt context (cast locale to Locale type)
  // Note: assemblePromptGraphAsync expects PromptAssemblyState, so we cast appropriately
  const promptContext = {
    systemRole,
    request: { inhalt, requestType, locale: locale as Locale },
    documents: enrichedContext?.documents || [],
    knowledge: knowledgeItems,
    locale: locale as Locale
  };

  // Assemble prompt (any cast needed due to document type mismatch between simple docs and ClaudeDocument[])
  const assembledPrompt = await assemblePromptGraphAsync(promptContext as any) as unknown as AssembledPromptResult;

  // Generate final text (convert ClaudeMessage[] to simple format)
  const simpleMessages = assembledPrompt.messages.map(msg => ({
    role: msg.role,
    content: Array.isArray(msg.content)
      ? msg.content.map(block => {
          if ('type' in block && block.type === 'text' && 'text' in block) {
            return block.text;
          }
          return '';
        }).join('\n')
      : String(msg.content || '')
  }));

  const generationResult = await aiWorkerPool.processRequest(
    {
      type: requestType,
      systemPrompt: assembledPrompt.system,
      messages: simpleMessages,
      options: {
        max_tokens: config.options?.max_tokens || 4000,
        temperature: config.options?.temperature || 0.3,
        ...(assembledPrompt.tools?.length && assembledPrompt.tools.length > 0 && { tools: assembledPrompt.tools as any })
      }
    } as AIWorkerRequest,
    req
  );

  if (!generationResult.success) {
    throw new Error('Generation failed: ' + generationResult.error);
  }

  console.log(`[SimpleInteractiveGenerator] Generation completed: ${generationResult.content?.length || 0} chars`);

  return {
    content: generationResult.content || '',
    metadata: generationResult.metadata
  };
}

/**
 * CONTINUE: Process answers, optionally web search, generate final result
 */
export async function continueInteractiveGenerator({
  userId,
  sessionId,
  answers,
  aiWorkerPool,
  req
}: ContinueGeneratorParams): Promise<ContinueGeneratorResult> {
  console.log(`[SimpleInteractiveGenerator] Continuing session: ${sessionId}`);

  try {
    // Retrieve session
    const sessionData = await getExperimentalSession(userId, sessionId) as ExperimentalSession | null;
    if (!sessionData) {
      throw new Error('Session not found or expired');
    }

    // Convert ExperimentalSession to InteractiveSession
    const session: InteractiveSession = {
      sessionId: sessionData.sessionId || sessionId,
      conversationState: (sessionData.conversationState as InteractiveSession['conversationState']) || 'questions_asked',
      inhalt: sessionData.inhalt || '',
      requestType: sessionData.requestType || 'antrag',
      generatorType: sessionData.generatorType || 'antrag',
      locale: (sessionData.locale as Locale) || ('de-DE' as Locale),
      questionRound: sessionData.questionRound || 1,
      questions: sessionData.questions || [],
      answers: sessionData.answers || {},
      metadata: {
        startTime: sessionData.createdAt || Date.now(),
        ...sessionData.metadata
      }
    };

    // Update session with answers
    await updateExperimentalSession(userId, sessionId, {
      answers: { round1: answers },
      conversationState: 'generating',
      lastUpdated: Date.now()
    });

    // Generate final result using helper
    const result = await generateFinalResult({
      userId,
      sessionId,
      inhalt: session.inhalt,
      requestType: session.requestType,
      generatorType: session.generatorType || 'antrag',
      locale: session.locale,
      questions: session.questions,
      answers,
      aiWorkerPool,
      req
    });

    // Update session with final result
    const completedAt = Date.now();
    await updateExperimentalSession(userId, sessionId, {
      conversationState: 'completed',
      finalResult: result.content,
      metadata: {
        ...session.metadata,
        completedAt,
        duration: completedAt - session.metadata.startTime
      }
    });

    return {
      status: 'completed',
      sessionId,
      conversationState: 'completed',
      finalResult: result.content,
      metadata: {
        completedAt,
        duration: completedAt - session.metadata.startTime
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[SimpleInteractiveGenerator] Continue error:', error);
    return {
      status: 'error',
      sessionId,
      conversationState: 'completed',
      message: 'Fehler beim Fortsetzen der interaktiven Erstellung',
      error: errorMessage
    };
  }
}
