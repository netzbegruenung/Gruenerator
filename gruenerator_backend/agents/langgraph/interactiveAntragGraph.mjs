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
 * Helper: Question generation tool schema for Mistral function calling
 */
function getQuestionGenerationTool() {
  return {
    type: 'function',
    function: {
      name: 'create_antrag_questions',
      description: 'Erstellt strukturierte Fragen für die interaktive Antrag/Anfrage-Erstellung',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'Array von genau 5 Fragen',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Eindeutige ID im Format q{nummer}_{kategorie}, z.B. q1_scope',
                  pattern: '^q[0-9]_[a-z_]+$'
                },
                text: {
                  type: 'string',
                  description: 'Die Fragestellung',
                  minLength: 10
                },
                type: {
                  type: 'string',
                  description: 'Kategorie der Frage',
                  enum: ['measures', 'legal_basis', 'committee', 'budget', 'stakeholders', 'justification', 'goals', 'timeline', 'scope', 'audience', 'tone', 'structure', 'facts']
                },
                questionFormat: {
                  type: 'string',
                  description: 'Format der Frage: "yes_no" für einfache Ja/Nein-Fragen, "multiple_choice" für 2-4 Optionen',
                  enum: ['yes_no', 'multiple_choice']
                },
                options: {
                  type: 'array',
                  description: 'Bei yes_no: Genau ["Ja", "Nein"] oder beschreibende Varianten. Bei multiple_choice: 2-4 Antwortoptionen',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 4
                },
                optionEmojis: {
                  type: 'array',
                  description: 'Ein passendes Emoji für jede Option im options-Array. Muss gleiche Länge wie options haben. Wähle kontextbezogene, eindeutige Emojis die zur Option passen. Beispiele: Für "Gemeinderat" → 🏛️, "Bürger" → 👥, "Dringend" → ⚡, "Langfristig" → 📅',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 4
                },
                allowCustom: {
                  type: 'boolean',
                  description: 'Bei yes_no: false. Bei multiple_choice: true (ermöglicht eigene Antwort)'
                },
                allowMultiSelect: {
                  type: 'boolean',
                  description: 'Bei multiple_choice: true = Mehrfachauswahl möglich (Checkboxen), false = nur eine Option (Radio). Bei yes_no: immer false'
                },
                placeholder: {
                  type: 'string',
                  description: 'Platzhaltertext für das Eingabefeld bei eigener Antwort'
                }
              },
              required: ['id', 'text', 'type', 'questionFormat', 'options', 'allowCustom', 'allowMultiSelect']
            },
            minItems: 5,
            maxItems: 5
          }
        },
        required: ['questions']
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
 * Node 3: Generate Questions
 * Uses Mistral AI to generate contextual questions based on search results
 */
async function generateQuestionsNode(state) {
  console.log('[InteractiveAntragGraph] Generating questions');

  let questions;

  try {
    // Try AI generation via aiWorkerPool
    try {
      const questionConfig = loadPromptConfig('interactive_antrag_questions');
      const searchSummary = formatSearchResultsForPrompt(state.searchResults);

      const requestTypeNames = questionConfig.questionGeneration.requestTypeNames;
      const typeName = requestTypeNames[state.requestType] || state.requestType;

      const systemPrompt = SimpleTemplateEngine.render(
        questionConfig.questionGeneration.systemPrompt,
        { typeName }
      );

      const userPrompt = SimpleTemplateEngine.render(
        questionConfig.questionGeneration.userPromptTemplate,
        {
          typeName,
          thema: state.thema,
          details: state.details,
          searchSummary
        }
      );

      const tools = [getQuestionGenerationTool()];

      console.log('[InteractiveAntragGraph] Calling Mistral via aiWorkerPool for question generation...');

      const result = await state.aiWorkerPool.processRequest({
        type: 'antrag_question_generation',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: {
          ...questionConfig.options,
          tools
        }
      }, state.req);

      // Extract questions from tool call
      if (result.tool_calls && result.tool_calls.length > 0) {
        const toolCall = result.tool_calls[0];
        const functionArgs = typeof toolCall.input === 'string'
          ? JSON.parse(toolCall.input)
          : toolCall.input;
        questions = functionArgs.questions;

        // Validate and clean up optionEmojis
        questions.forEach((question, qIndex) => {
          if (question.optionEmojis) {
            if (question.optionEmojis.length !== question.options.length) {
              console.warn(`[InteractiveAntragGraph] Question ${qIndex + 1}: optionEmojis length (${question.optionEmojis.length}) doesn't match options length (${question.options.length}). Padding/truncating.`);

              while (question.optionEmojis.length < question.options.length) {
                question.optionEmojis.push('');
              }
              question.optionEmojis = question.optionEmojis.slice(0, question.options.length);
            }
          } else {
            question.optionEmojis = [];
          }
        });

        console.log(`[InteractiveAntragGraph] Generated ${questions.length} AI questions successfully`);
      } else {
        throw new Error('No tool call in AI response');
      }

    } catch (aiError) {
      console.warn('[InteractiveAntragGraph] AI question generation failed, falling back to predefined:', aiError.message);
      questions = getQuestionsForType(state.requestType, 1);
    }

    if (!questions || questions.length === 0) {
      throw new Error(`No questions could be generated for request type: ${state.requestType}`);
    }

    console.log(`[InteractiveAntragGraph] Using ${questions.length} questions for ${state.requestType}`);

    // Update session with questions
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'questions_generated',
        questionRound: 1,
        questions
      });
    }

    return {
      conversationState: 'questions_generated',
      questionRound: 1,
      questions
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error generating questions:', error);
    return {
      conversationState: 'error',
      error: error.message
    };
  }
}

/**
 * Node 3.5: Await User Answers
 * Interrupts the graph to wait for user input, then resumes with answers
 */
async function awaitAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Awaiting user answers');

  // Update session to indicate we're waiting for answers
  if (state.sessionId && state.userId) {
    await updateExperimentalSession(state.userId, state.sessionId, {
      conversationState: 'questions_asked',
      questionRound: state.questionRound || 1,
      questions: state.questions
    });
  }

  console.log('[InteractiveAntragGraph] Interrupting graph to await user answers');
  const userAnswers = interrupt({
    conversationState: 'questions_asked',
    questionRound: state.questionRound || 1,
    questions: state.questions,
    sessionId: state.sessionId
  });

  console.log('[InteractiveAntragGraph] Resumed with user answers');
  return {
    conversationState: 'answers_received',
    questionRound: state.questionRound || 1,
    questions: state.questions,
    answers: {
      round1: userAnswers
    },
    searchResults: null
  };
}

/**
 * Node 4: Analyze Answers
 * Proceeds directly to enrichment after receiving answers
 */
async function analyzeAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Answers received, proceeding to enrichment');

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
    checkpointer: new MemorySaver()
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
          req
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
