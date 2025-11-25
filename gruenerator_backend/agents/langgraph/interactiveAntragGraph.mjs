/**
 * Interactive Antrag Generator Graph using LangGraph
 *
 * Multi-step conversation flow:
 * 1. User provides thema, details, requestType
 * 2. Web search (SearXNG)
 * 3. AI generates 5 intelligent questions
 * 4. Graph interrupts to await user answers
 * 5. User answers questions, graph resumes
 * 6. Document enrichment (URL crawl, DocQnA, knowledge)
 * 7. Final generation with all context
 */

import { StateGraph, Annotation, MemorySaver, interrupt, Command } from "@langchain/langgraph";
import searxngService from '../../services/searxngWebSearchService.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';
import { loadPromptConfig, SimpleTemplateEngine } from './promptProcessor.js';
import {
  extractStructuredAnswers
} from '../chat/informationRequestHandler.js';
import {
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession
} from '../../services/chatMemoryService.js';
import { getQuestionsForType } from '../../config/antragQuestions.js';
import { RedisCheckpointer } from './RedisCheckpointer.mjs';
import redisClient from '../../utils/redisClient.js';

// State schema for interactive Antrag flow
const InteractiveAntragState = Annotation.Root({
  // Session identifiers
  sessionId: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  userId: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Conversation state
  conversationState: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // User input
  thema: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  details: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  requestType: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  locale: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Web search results
  searchResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Question-answer flow
  questionRound: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  questions: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  answers: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  allAnswers: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  needsFollowUp: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Enrichment context
  enrichedContext: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Generation
  finalResult: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // AI worker pool
  aiWorkerPool: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Metadata
  metadata: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Error handling
  error: Annotation({
    reducer: (x, y) => y ?? x,
  })
});

/**
 * Helper: Format search results for Mistral prompt
 */
function formatSearchResultsForPrompt(searchResults) {
  if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
    return 'Keine Suchergebnisse verfügbar.';
  }

  const topResults = searchResults.results.slice(0, 5);
  return topResults
    .map((result, index) => `${index + 1}. ${result.title}\n   ${result.content_snippets || result.snippet || ''}`)
    .join('\n\n');
}

/**
 * Helper: Question generation tool schema for Mistral function calling (AI questions only)
 */
function getQuestionOptionsGenerationTool() {
  return {
    type: 'function',
    function: {
      name: 'generate_question_options',
      description: 'Generates answer options for a specific question based on topic, details, and search results',
      parameters: {
        type: 'object',
        properties: {
          questionId: {
            type: 'string',
            enum: ['q2_pain_point', 'q3_beneficiaries', 'q5_history'],
            description: 'The ID of the question for which options are generated'
          },
          options: {
            type: 'array',
            description: 'Array of 3-4 answer options for this question',
            items: {
              type: 'string'
            },
            minItems: 3,
            maxItems: 4
          },
          optionEmojis: {
            type: 'array',
            description: 'Array of emojis matching each option (same length as options)',
            items: {
              type: 'string'
            },
            minItems: 3,
            maxItems: 4
          }
        },
        required: ['questionId', 'options', 'optionEmojis']
      }
    }
  };
}

/**
 * Node 1: Initiate Session
 * Validates input and creates session in Redis
 */
async function initiateNode(state) {
  try {
    // Validate required fields
    if (!state.thema || !state.details || !state.requestType) {
      throw new Error('Missing required fields: thema, details, requestType');
    }

    if (!state.userId) {
      throw new Error('Missing userId');
    }

    // Use sessionId from state if provided, otherwise generate new one
    const sessionId = state.sessionId || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create session data
    const sessionData = {
      sessionId, // Include sessionId in data
      conversationState: 'initiated',
      thema: state.thema,
      details: state.details,
      requestType: state.requestType,
      locale: state.locale || 'de-DE',
      questionRound: 0,
      questions: [],
      answers: {},
      metadata: {
        startTime: Date.now()
      }
    };

    // Create session in Redis (setExperimentalSession uses sessionId from sessionData)
    await setExperimentalSession(state.userId, sessionData);

    return {
      sessionId,
      conversationState: 'initiated',
      metadata: {
        startTime: Date.now()
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in initiate node:', error);
    return {
      conversationState: 'error',
      error: error.message
    };
  }
}

/**
 * Node 2: Web Search
 * Performs SearXNG search to gather context
 */
async function webSearchNode(state) {
  console.log('[InteractiveAntragGraph] Performing web search');

  try {
    // Build search query
    const query = `${state.thema} ${state.details} ${state.requestType} Bündnis 90 Die Grünen`;

    console.log(`[InteractiveAntragGraph] Search query: "${query}"`);

    // Perform web search
    const searchResult = await searxngService.performWebSearch(query, {
      maxResults: 10,
      language: 'de-DE',
      categories: 'general,news'
    });

    if (!searchResult.success) {
      console.warn('[InteractiveAntragGraph] Web search failed, continuing without results');
      return {
        searchResults: {
          query,
          results: [],
          success: false
        }
      };
    }

    // Format results for question generation
    const formattedResults = {
      query,
      results: searchResult.results || [],
      summary: `Found ${searchResult.results?.length || 0} results`,
      sources: (searchResult.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content_snippets
      }))
    };

    console.log(`[InteractiveAntragGraph] Web search completed: ${formattedResults.results.length} results`);

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        searchResults: formattedResults
      });
    }

    return {
      searchResults: formattedResults
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in web search node:', error);
    return {
      searchResults: {
        query: state.thema,
        results: [],
        success: false,
        error: error.message
      }
    };
  }
}

/**
 * Node 3: Generate Questions (Hybrid: Static + AI)
 * Combines static questions with AI-generated options for specific questions
 */
async function generateQuestionsNode(state) {
  console.log('[InteractiveAntragGraph] Generating hybrid questions (static + AI)');

  try {
    const questionConfig = loadPromptConfig('interactive_antrag_questions');
    const searchSummary = formatSearchResultsForPrompt(state.searchResults);

    // Initialize questions array with 6 static question templates
    const questions = [
      // Q1: Static question (action_type)
      { ...questionConfig.staticQuestions.q1_action_type },
      // Q2: AI-generated (pain_point)
      null,
      // Q3: AI-generated (beneficiaries)
      null,
      // Q4: Static question (budget)
      { ...questionConfig.staticQuestions.q4_budget },
      // Q5: AI-generated (history)
      null,
      // Q6: Static question (urgency)
      { ...questionConfig.staticQuestions.q6_urgency }
    ];

    // AI question IDs and their templates
    const aiQuestionIds = ['q2_pain_point', 'q3_beneficiaries', 'q5_history'];
    const aiQuestionTemplates = questionConfig.aiQuestionGeneration.questionTemplates;

    // Try to generate AI options for questions 2, 3, 5
    const aiGenerationPromises = aiQuestionIds.map(async (questionId, index) => {
      const template = aiQuestionTemplates[questionId];
      if (!template) {
        console.warn(`[InteractiveAntragGraph] No template found for ${questionId}`);
        return { questionId, success: false };
      }

      try {
        const systemPrompt = questionConfig.aiQuestionGeneration.systemPrompt;
        const userPrompt = SimpleTemplateEngine.render(template.generationPrompt, {
          thema: state.thema,
          details: state.details,
          searchSummary
        });

        const tools = [getQuestionOptionsGenerationTool()];

        console.log(`[InteractiveAntragGraph] Generating AI options for ${questionId}...`);

        const result = await state.aiWorkerPool.processRequest({
          type: 'antrag_question_generation',
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          options: {
            ...questionConfig.options,
            tools
          }
        }, state.req);

        if (result.tool_calls && result.tool_calls.length > 0) {
          const toolCall = result.tool_calls[0];
          const functionArgs = typeof toolCall.input === 'string'
            ? JSON.parse(toolCall.input)
            : toolCall.input;

          // Validate emoji array length
          if (functionArgs.optionEmojis?.length !== functionArgs.options?.length) {
            console.warn(`[InteractiveAntragGraph] ${questionId}: Emoji count mismatch, padding...`);
            while (functionArgs.optionEmojis.length < functionArgs.options.length) {
              functionArgs.optionEmojis.push('❓');
            }
            functionArgs.optionEmojis = functionArgs.optionEmojis.slice(0, functionArgs.options.length);
          }

          return {
            questionId,
            success: true,
            options: functionArgs.options,
            optionEmojis: functionArgs.optionEmojis
          };
        } else {
          console.warn(`[InteractiveAntragGraph] No tool call for ${questionId}`);
          return { questionId, success: false };
        }

      } catch (error) {
        console.warn(`[InteractiveAntragGraph] AI generation failed for ${questionId}:`, error.message);
        return { questionId, success: false };
      }
    });

    // Wait for all AI generations
    const aiResults = await Promise.all(aiGenerationPromises);

    // Build final questions array
    aiResults.forEach((result) => {
      if (result.success) {
        const template = aiQuestionTemplates[result.questionId];
        const questionIndex = result.questionId === 'q2_pain_point' ? 1 :
                             result.questionId === 'q3_beneficiaries' ? 2 : 4;

        questions[questionIndex] = {
          id: template.id,
          text: template.text,
          type: template.type,
          questionFormat: template.questionFormat,
          options: result.options,
          optionEmojis: result.optionEmojis,
          allowCustom: template.allowCustom,
          allowMultiSelect: template.allowMultiSelect,
          placeholder: template.placeholder
        };
      } else {
        // Fallback to predefined for this specific question
        console.warn(`[InteractiveAntragGraph] Using fallback for ${result.questionId}`);
        const fallbackQuestions = getQuestionsForType(state.requestType, 1);
        const questionIndex = result.questionId === 'q2_pain_point' ? 1 :
                             result.questionId === 'q3_beneficiaries' ? 2 : 4;

        // Use fallback question if available, otherwise create generic
        if (fallbackQuestions && fallbackQuestions[questionIndex]) {
          questions[questionIndex] = fallbackQuestions[questionIndex];
        } else {
          const template = aiQuestionTemplates[result.questionId];
          questions[questionIndex] = {
            id: template.id,
            text: template.text,
            type: template.type,
            questionFormat: template.questionFormat,
            options: ['Keine Angabe'],
            optionEmojis: ['❓'],
            allowCustom: true,
            allowMultiSelect: template.allowMultiSelect,
            placeholder: template.placeholder
          };
        }
      }
    });

    // Defensive: Ensure Q4 always has exactly 4 options (including skip)
    if (questions[3]) {
      const q4 = questions[3];
      if (!q4.options || q4.options.length !== 4 || !q4.options.includes('Überspringen')) {
        console.warn('[InteractiveAntragGraph] Q4 options corrupted, restoring from static config');
        questions[3] = { ...questionConfig.staticQuestions.q4_budget };
      }
    }

    // Final validation - ensure all questions are filled
    const validQuestions = questions.filter(q => q !== null);
    if (validQuestions.length !== 6) {
      console.error('[InteractiveAntragGraph] Not all 6 questions were generated, falling back completely');
      const fallbackQuestions = getQuestionsForType(state.requestType, 1);
      return {
        conversationState: 'questions_generated',
        questionRound: 1,
        questions: fallbackQuestions
      };
    }

    console.log(`[InteractiveAntragGraph] Successfully generated 6 hybrid questions (3 static + 3 AI)`);

    // Update session with questions
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'questions_generated',
        questionRound: 1,
        questions: validQuestions
      });
    }

    return {
      conversationState: 'questions_generated',
      questionRound: 1,
      questions: validQuestions
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error generating questions:', error);
    // Complete fallback
    try {
      const fallbackQuestions = getQuestionsForType(state.requestType, 1);
      return {
        conversationState: 'questions_generated',
        questionRound: 1,
        questions: fallbackQuestions
      };
    } catch (fallbackError) {
      return {
        conversationState: 'error',
        error: error.message
      };
    }
  }
}

/**
 * Node 3.5: Await User Answers
 * Interrupts the graph to wait for user input, then resumes with answers
 *
 * IMPORTANT: Code after interrupt() is NEVER executed. When the graph resumes
 * via Command({ update }), it continues to the NEXT node (analyze_answers).
 * User answers are injected into state via Command({ update: { answers } }).
 */
async function awaitAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Awaiting user answers');

  // Update Redis session to indicate we're waiting for answers
  if (state.sessionId && state.userId) {
    await updateExperimentalSession(state.userId, state.sessionId, {
      conversationState: 'questions_asked',
      questionRound: state.questionRound || 1,
      questions: state.questions
    });
  }

  console.log('[InteractiveAntragGraph] Interrupting graph - will resume at next node');

  // Graph execution terminates here. When resumed via Command({ update }),
  // the graph continues to the next node (analyze_answers) with updated state.
  // The answers will be injected via Command({ update: { answers } }).
  interrupt({
    conversationState: 'questions_asked',
    questionRound: state.questionRound || 1,
    questions: state.questions,
    sessionId: state.sessionId
  });

  // Code below this point is NEVER executed - interrupt() terminates the node
}

/**
 * Node 4: Analyze Answers
 * Proceeds directly to enrichment after receiving answers
 */
async function analyzeAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Resumed after interrupt - analyzing answers');
  console.log('[InteractiveAntragGraph] Answers received:', {
    hasAnswers: !!state.answers,
    hasRound1: !!state.answers?.round1,
    answerCount: Object.keys(state.answers?.round1 || {}).length
  });

  try {
    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'answers_received',
        needsFollowUp: false
      });
    }

    return {
      conversationState: 'answers_received',
      needsFollowUp: false
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error processing answers:', error);
    return {
      conversationState: 'answers_received',
      needsFollowUp: false,
      metadata: {
        ...state.metadata,
        analysisError: error.message
      }
    };
  }
}

/**
 * Node 5: Document Enrichment
 * Applies full enrichment pipeline (URL crawl, DocQnA, knowledge)
 */
async function documentEnrichmentNode(state) {
  console.log('[InteractiveAntragGraph] Applying document enrichment');

  try {
    // Extract structured answers from all rounds
    const allQuestions = state.questions || [];

    // Flatten all answers from all rounds
    let allAnswers = {};
    if (state.answers) {
      // If answers are organized by round
      if (state.answers.round1 || state.answers.round2) {
        allAnswers = {
          ...(state.answers.round1 || {}),
          ...(state.answers.round2 || {})
        };
      } else {
        // If answers are flat
        allAnswers = state.answers;
      }
    }

    const structuredAnswers = extractStructuredAnswers(allAnswers, allQuestions);

    console.log('[InteractiveAntragGraph] Extracted structured answers:', {
      hasScope: structuredAnswers.scope?.length > 0,
      hasAudience: !!structuredAnswers.audience,
      hasFacts: structuredAnswers.facts?.length > 0,
      hasTone: !!structuredAnswers.tone
    });

    const enrichmentRequest = {
      thema: state.thema,
      details: state.details,
      requestType: state.requestType,
      userClarifications: structuredAnswers
    };

    // Apply enrichment (URL crawl, DocQnA, knowledge)
    const enrichedContext = await enrichRequest(enrichmentRequest, state.userId);

    console.log('[InteractiveAntragGraph] Enrichment completed:', {
      documentsAdded: enrichedContext.documents?.length || 0,
      knowledgeAdded: enrichedContext.knowledge?.length || 0,
      urlsCrawled: enrichedContext.urlsCrawled?.length || 0
    });

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'generating',
        enrichedContext,
        allAnswers: structuredAnswers
      });
    }

    return {
      conversationState: 'generating',
      enrichedContext,
      allAnswers: structuredAnswers
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in enrichment:', error);
    // Continue without enrichment
    return {
      conversationState: 'generating',
      enrichedContext: {},
      metadata: {
        ...state.metadata,
        enrichmentError: error.message
      }
    };
  }
}

/**
 * Node 6: Final Generation
 * Assembles full context and generates the Antrag/Anfrage
 */
async function finalGenerationNode(state) {
  console.log('[InteractiveAntragGraph] Generating final result');

  try {
    // Load configuration from antrag_experimental.json
    const config = loadPromptConfig('antrag_experimental');

    // Build system role from config
    let systemRole = config.systemRole || 'Du bist ein Experte für politische Anträge bei Bündnis 90/Die Grünen.';

    // Apply request type extension if exists
    if (config.systemRoleExtensions) {
      const extension = config.systemRoleExtensions[state.requestType] || config.systemRoleExtensions.default;
      if (extension) {
        systemRole += ' ' + extension;
      }
    }

    // Add appendix
    if (config.systemRoleAppendix) {
      systemRole += ' ' + config.systemRoleAppendix;
    }

    console.log('[InteractiveAntragGraph] Using systemRole from config');

    let userClarificationsFormatted = '';
    if (state.allAnswers) {
      userClarificationsFormatted = '\n\n## Präzisierungen aus dem Verständnisgespräch\n\n';

      if (state.allAnswers.scope && state.allAnswers.scope.length > 0) {
        userClarificationsFormatted += '**Inhaltliche Schwerpunkte:**\n';
        state.allAnswers.scope.forEach(item => {
          userClarificationsFormatted += `- ${item}\n`;
        });
        userClarificationsFormatted += '\n';
      }

      if (state.allAnswers.audience) {
        userClarificationsFormatted += `**Adressat/Gremium:** ${state.allAnswers.audience}\n\n`;
      }

      if (state.allAnswers.tone) {
        userClarificationsFormatted += `**Gewünschte Tonalität:** ${state.allAnswers.tone}\n\n`;
      }

      if (state.allAnswers.structure) {
        userClarificationsFormatted += `**Bevorzugte Struktur:** ${state.allAnswers.structure}\n\n`;
      }

      if (state.allAnswers.facts && state.allAnswers.facts.length > 0) {
        userClarificationsFormatted += '**Gewünschte Fakten/Zahlen:**\n';
        state.allAnswers.facts.forEach(fact => {
          userClarificationsFormatted += `- ${fact}\n`;
        });
        userClarificationsFormatted += '\n';
      }

      if (state.allAnswers.clarifications && state.allAnswers.clarifications.length > 0) {
        userClarificationsFormatted += '**Weitere Präzisierungen:**\n';
        state.allAnswers.clarifications.forEach(item => {
          userClarificationsFormatted += `- ${item}\n`;
        });
      }
    }

    const promptContext = {
      systemRole,
      request: {
        thema: state.thema,
        details: state.details,
        requestType: state.requestType,
        userClarifications: userClarificationsFormatted,
        locale: state.locale || 'de-DE'
      },
      documents: state.enrichedContext?.documents || [],
      knowledge: state.enrichedContext?.knowledge || [],
      locale: state.locale || 'de-DE'
    };

    console.log('[InteractiveAntragGraph] Assembling prompt with context:', {
      hasDocuments: promptContext.documents.length > 0,
      hasKnowledge: promptContext.knowledge.length > 0,
      hasClarifications: !!state.allAnswers
    });

    // Assemble prompt using existing infrastructure
    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    // Generate final text using AI worker pool
    const generationResult = await state.aiWorkerPool.processRequest({
      type: state.requestType,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages,
      options: {
        max_tokens: config.options?.max_tokens || 4000,
        temperature: config.options?.temperature || 0.3,
        ...(assembledPrompt.tools?.length > 0 && { tools: assembledPrompt.tools })
      }
    }, state.req);

    if (!generationResult.success) {
      throw new Error('Generation failed: ' + generationResult.error);
    }

    const finalResult = generationResult.content;

    console.log('[InteractiveAntragGraph] Generation completed:', {
      length: finalResult?.length || 0,
      hasResult: !!finalResult
    });

    // Update session with final result
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'completed',
        finalResult,
        metadata: {
          ...state.metadata,
          completedAt: Date.now(),
          duration: Date.now() - (state.metadata?.startTime || Date.now())
        }
      });
    }

    return {
      conversationState: 'completed',
      finalResult,
      metadata: {
        ...state.metadata,
        completedAt: Date.now(),
        duration: Date.now() - (state.metadata?.startTime || Date.now())
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in final generation:', error);
    return {
      conversationState: 'error',
      error: error.message
    };
  }
}

/**
 * Build and compile the Interactive Antrag Graph
 */
function createInteractiveAntragGraph() {
  const graph = new StateGraph(InteractiveAntragState);

  // Add all nodes
  graph.addNode("initiate", initiateNode);
  graph.addNode("web_search", webSearchNode);
  graph.addNode("generate_questions", generateQuestionsNode);
  graph.addNode("await_answers", awaitAnswersNode);
  graph.addNode("analyze_answers", analyzeAnswersNode);
  graph.addNode("document_enrichment", documentEnrichmentNode);
  graph.addNode("final_generation", finalGenerationNode);

  // Set entry point
  graph.setEntryPoint("initiate");

  graph.addConditionalEdges(
    "initiate",
    (state) => {
      if (state.conversationState === 'error') {
        return "__end__";
      }
      return "web_search";
    }
  );
  graph.addEdge("web_search", "generate_questions");
  graph.addEdge("generate_questions", "await_answers");
  graph.addEdge("await_answers", "analyze_answers");

  graph.addEdge("analyze_answers", "document_enrichment");
  graph.addEdge("document_enrichment", "final_generation");
  graph.addEdge("final_generation", "__end__");

  return graph.compile({
    checkpointer: new RedisCheckpointer(redisClient)
  });
}

// Export the compiled graph
export const interactiveAntragGraph = createInteractiveAntragGraph();

/**
 * Execute the interactive Antrag flow - Initiate Phase
 * This starts the conversation and returns questions
 */
export async function initiateInteractiveAntrag({
  userId,
  thema,
  details,
  requestType,
  locale = 'de-DE',
  aiWorkerPool,
  req
}) {
  console.log('[InteractiveAntragGraph] Initiating interactive Antrag flow');

  const sessionId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const initialState = {
      userId,
      thema,
      details,
      requestType,
      locale,
      aiWorkerPool,
      req,
      sessionId,
      questionRound: 0,
      answers: {},
      metadata: {}
    };

    const result = await interactiveAntragGraph.invoke(initialState, {
      configurable: { thread_id: sessionId }
    });

    console.log('[InteractiveAntragGraph] Graph invoke returned:', {
      hasInterrupt: !!result.__interrupt__,
      conversationState: result.conversationState,
      hasQuestions: !!result.questions,
      questionCount: result.questions?.length || 0
    });

    if (result.__interrupt__ && result.__interrupt__.length > 0) {
      console.log('[InteractiveAntragGraph] Graph interrupted successfully');
      const interruptValue = result.__interrupt__[0].value;

      return {
        status: 'success',
        sessionId: sessionId,
        conversationState: interruptValue.conversationState,
        questions: interruptValue.questions,
        questionRound: interruptValue.questionRound,
        metadata: {
          searchResultsCount: 0, // Search results not in interrupt value
          questionCount: interruptValue.questions?.length || 0
        }
      };
    }

    if (result.conversationState === 'error') {
      console.error('[InteractiveAntragGraph] Graph returned error state');
      return {
        status: 'error',
        message: result.error || 'Fehler beim Starten der interaktiven Antragserstellung',
        error: result.error
      };
    }

    console.warn('[InteractiveAntragGraph] Graph completed without interrupt - unexpected');
    return {
      status: 'success',
      sessionId: sessionId,
      conversationState: result.conversationState,
      questions: result.questions,
      questionRound: result.questionRound,
      metadata: {
        searchResultsCount: result.searchResults?.results?.length || 0,
        questionCount: result.questions?.length || 0
      }
    };

  } catch (error) {
    // Real error
    console.error('[InteractiveAntragGraph] Initiate error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Starten der interaktiven Antragserstellung',
      error: error.message
    };
  }
}

/**
 * Continue the interactive Antrag flow - Answer Phase
 * This processes user answers and generates final result
 */
export async function continueInteractiveAntrag({
  userId,
  sessionId,
  answers,
  aiWorkerPool,
  req
}) {
  console.log(`[InteractiveAntragGraph] Continuing session: ${sessionId}`);

  try {
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      throw new Error('Session not found or expired');
    }

    await updateExperimentalSession(userId, sessionId, {
      lastAnswers: answers,
      lastUpdated: Date.now()
    });

    const result = await interactiveAntragGraph.invoke(
      new Command({
        resume: answers,
        update: {
          aiWorkerPool,
          req,
          answers: {
            round1: answers
          },
          conversationState: 'answers_received'
        }
      }),
      {
        configurable: { thread_id: sessionId }
      }
    );

    if (result.conversationState === 'completed') {
      return {
        status: 'completed',
        sessionId: sessionId,
        conversationState: result.conversationState,
        finalResult: result.finalResult,
        metadata: result.metadata
      };
    } else if (result.conversationState === 'error') {
      return {
        status: 'error',
        message: result.error || 'Fehler bei der Verarbeitung',
        error: result.error
      };
    } else {
      // Still in progress or unexpected state
      return {
        status: 'in_progress',
        sessionId: sessionId,
        conversationState: result.conversationState,
        message: 'Zwischenstatus erreicht'
      };
    }

  } catch (error) {

    // Real error
    console.error('[InteractiveAntragGraph] Continue error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Fortsetzen der interaktiven Antragserstellung',
      error: error.message
    };
  }
}
