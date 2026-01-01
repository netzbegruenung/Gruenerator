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

import {
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession
} from '../../services/chatMemoryService.js';
import { loadPromptConfig, SimpleTemplateEngine } from './promptProcessor.js';
import { getQuestionsForType } from '../../config/antragQuestions.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';

// Lazy-loaded optional services
let _searxngService = null;
let _searxngLoaded = false;

async function getSearxngService() {
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
async function generateClarifyingQuestions(state) {
  const generatorType = state.generatorType || 'antrag';
  const config = loadPromptConfig(`interactive_questions_${generatorType}`);

  const userPrompt = SimpleTemplateEngine.render(config.generationPrompt, {
    inhalt: state.inhalt,
    requestType: state.requestType,
    searchSummary: 'Keine Suchergebnisse verfügbar.'
  });

  const tools = [config.toolSchema];

  console.log(`[SimpleInteractiveGenerator] Generating questions for ${generatorType}...`);

  const result = await state.aiWorkerPool.processRequest({
    type: 'antrag_question_generation',
    systemPrompt: config.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    options: {
      ...config.options,
      tools
    }
  }, state.req);

  if (result.tool_calls && result.tool_calls.length > 0) {
    const toolCall = result.tool_calls[0];
    const functionArgs = typeof toolCall.input === 'string'
      ? JSON.parse(toolCall.input)
      : toolCall.input;

    // Check if AI decided clarification is needed
    const needsClarification = functionArgs.needsClarification;
    const confidenceReason = functionArgs.confidenceReason || '';

    if (!needsClarification || !functionArgs.questions || functionArgs.questions.length === 0) {
      console.log(`[SimpleInteractiveGenerator] AI decided no questions needed: ${confidenceReason}`);
      return { needsClarification: false, questions: [], confidenceReason };
    }

    const questions = functionArgs.questions.map((q, index) => ({
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
function formatQAPairs(questions, answers) {
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
async function performWebSearch(state) {
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
          snippet: r.content_snippets || r.snippet
        }))
      };
    }
  } catch (error) {
    console.warn('[SimpleInteractiveAntrag] Web search failed:', error.message);
  }

  return null;
}

/**
 * Extract structured answers for enrichment
 */
function extractStructuredAnswers(answers, questions) {
  const structured = {
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
        structured.actionType = answer;
        break;
      case 'pain_point':
        structured.painPoint = answer;
        break;
      case 'beneficiaries':
        structured.beneficiaries = Array.isArray(answer) ? answer : [answer];
        break;
      case 'budget':
        structured.budget = answer;
        break;
      case 'history':
        structured.history = answer;
        break;
      case 'urgency':
        structured.urgency = answer;
        break;
      case 'scope':
        structured.scope.push(answer);
        break;
      case 'audience':
        structured.audience = answer;
        break;
      case 'tone':
        structured.tone = answer;
        break;
      case 'facts':
        structured.facts.push(answer);
        break;
      case 'structure':
        structured.structure = answer;
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
}) {
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
    const sessionData = {
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
    console.error('[SimpleInteractiveGenerator] Initiate error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Starten der interaktiven Erstellung',
      error: error.message
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
}) {
  // Format Q&A pairs if present
  const formattedQA = questions.length > 0 ? formatQAPairs(questions, answers) : '';

  // Check if web search is enabled
  const useWebSearch = req.body?.useWebSearch ?? false;
  let searchResults = null;

  if (useWebSearch) {
    searchResults = await performWebSearch({ inhalt, locale });
  }

  // Load config for final generation (dynamic based on generator type)
  const config = loadPromptConfig(`${generatorType}_experimental`);

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
    : {};

  // Build enrichment request
  const enrichmentRequest = {
    inhalt,
    requestType,
    userClarifications: structuredAnswers
  };

  // Apply document enrichment
  const enrichedContext = await enrichRequest(enrichmentRequest, userId);

  // Build knowledge array
  const knowledgeItems = [];

  if (formattedQA) {
    knowledgeItems.push(formattedQA);
  }

  if (enrichedContext?.knowledge?.length > 0) {
    knowledgeItems.push(...enrichedContext.knowledge);
  }

  if (searchResults?.sources?.length > 0) {
    knowledgeItems.push(...searchResults.sources.map(s => `${s.title}: ${s.snippet}`).slice(0, 5));
  }

  console.log(`[SimpleInteractiveGenerator] Knowledge items: ${knowledgeItems.length}`);

  // Prepare prompt context
  const promptContext = {
    systemRole,
    request: { inhalt, requestType, locale },
    documents: enrichedContext?.documents || [],
    knowledge: knowledgeItems,
    locale
  };

  // Assemble prompt
  const assembledPrompt = await assemblePromptGraphAsync(promptContext);

  // Generate final text
  const generationResult = await aiWorkerPool.processRequest({
    type: requestType,
    systemPrompt: assembledPrompt.system,
    messages: assembledPrompt.messages,
    options: {
      max_tokens: config.options?.max_tokens || 4000,
      temperature: config.options?.temperature || 0.3,
      ...(assembledPrompt.tools?.length > 0 && { tools: assembledPrompt.tools })
    }
  }, req);

  if (!generationResult.success) {
    throw new Error('Generation failed: ' + generationResult.error);
  }

  console.log(`[SimpleInteractiveGenerator] Generation completed: ${generationResult.content?.length || 0} chars`);

  return {
    content: generationResult.content,
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
}) {
  console.log(`[SimpleInteractiveGenerator] Continuing session: ${sessionId}`);

  try {
    // Retrieve session
    const session = await getExperimentalSession(userId, sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

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
    console.error('[SimpleInteractiveGenerator] Continue error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Fortsetzen der interaktiven Erstellung',
      error: error.message
    };
  }
}
