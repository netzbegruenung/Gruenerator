/**
 * ChatGraph - LangGraph-Based Agentic Chat
 *
 * Solves the AI SDK toolChoice: 'required' loop trap by providing explicit
 * control flow for chat with search capabilities.
 *
 * Graph flow:
 *   START → classifier → [search|respond] → respond → END
 *
 * The classifier determines intent, and the graph routes accordingly:
 * - search intents → search node → respond node
 * - direct intent → respond node directly
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import type {
  ChatGraphState,
  ChatGraphInput,
  ChatGraphOutput,
  SearchIntent,
  SearchResult,
  Citation,
} from './types.js';
import { classifierNode } from './nodes/classifierNode.js';
import { searchNode } from './nodes/searchNode.js';
import { respondNode } from './nodes/respondNode.js';
import { getAgent, getDefaultAgentId } from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';
import type { ModelMessage } from 'ai';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';

const log = createLogger('ChatGraph');

/**
 * State annotation for the ChatGraph.
 * Defines how each field is updated when nodes return partial state.
 */
const ChatStateAnnotation = Annotation.Root({
  // Input (immutable after initialization)
  messages: Annotation<ModelMessage[]>({
    reducer: (x, y) => y ?? x,
  }),
  threadId: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  agentConfig: Annotation<AgentConfig>({
    reducer: (x, y) => y ?? x,
  }),
  enabledTools: Annotation<Record<string, boolean>>({
    reducer: (x, y) => y ?? x,
  }),
  aiWorkerPool: Annotation<any>({
    reducer: (x, y) => y ?? x,
  }),

  // Classification output
  intent: Annotation<SearchIntent>({
    reducer: (x, y) => y ?? x,
  }),
  searchQuery: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  reasoning: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),

  // Search results (accumulated from search node)
  searchResults: Annotation<SearchResult[]>({
    reducer: (x, y) => {
      // Accumulate search results if both exist
      if (y && y.length > 0) {
        return [...(x || []), ...y];
      }
      return x || [];
    },
  }),
  citations: Annotation<Citation[]>({
    reducer: (x, y) => {
      if (y && y.length > 0) {
        return [...(x || []), ...y];
      }
      return x || [];
    },
  }),
  searchCount: Annotation<number>({
    reducer: (x, y) => (x || 0) + (y || 0),
  }),
  maxSearches: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 3,
  }),

  // Response generation
  responseText: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  streamingStarted: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),

  // Metadata for observability
  startTime: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  classificationTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  searchTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  responseTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x,
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
});

/**
 * Type alias for state derived from annotation
 */
type ChatState = typeof ChatStateAnnotation.State;

/**
 * Routing function: After classification, decide search or respond.
 *
 * Routes to 'search' if:
 * - Intent is a search intent (research, search, person, web, examples)
 * - The required tool is enabled
 *
 * Routes to 'respond' if:
 * - Intent is 'direct'
 * - The required tool is disabled
 */
function routeAfterClassification(state: ChatState): 'search' | 'respond' {
  const { intent, enabledTools } = state;

  // Direct intent = no search needed
  if (intent === 'direct') {
    log.info('[ChatGraph] Route: classifier → respond (direct intent)');
    return 'respond';
  }

  // Map intent to tool key for enabled check
  const intentToToolKey: Record<SearchIntent, string> = {
    research: 'research',
    search: 'search',
    person: 'person',
    web: 'web',
    examples: 'examples',
    direct: 'direct',
  };

  const toolKey = intentToToolKey[intent];

  // Check if the required tool is enabled
  if (enabledTools && enabledTools[toolKey] === false) {
    log.info(`[ChatGraph] Route: classifier → respond (tool "${toolKey}" disabled)`);
    return 'respond';
  }

  log.info(`[ChatGraph] Route: classifier → search (intent: ${intent})`);
  return 'search';
}

/**
 * Create the ChatGraph.
 *
 * Graph structure:
 *   START → classifier → [conditional: search|respond]
 *   search → respond
 *   respond → END
 */
function createChatGraph() {
  const graph = new StateGraph(ChatStateAnnotation)
    // Add nodes
    .addNode('classifier', classifierNode as any)
    .addNode('search', searchNode as any)
    .addNode('respond', respondNode as any)

    // START → classifier
    .addEdge('__start__', 'classifier')

    // classifier → conditional routing
    .addConditionalEdges('classifier', routeAfterClassification, {
      search: 'search',
      respond: 'respond',
    })

    // search → respond
    .addEdge('search', 'respond')

    // respond → END
    .addEdge('respond', '__end__');

  return graph.compile();
}

// Module-level compiled graph (compiled once, reused for all requests)
export const chatGraph = createChatGraph();

/**
 * Initialize state from input.
 * Loads agent configuration and sets up initial state.
 */
export async function initializeChatState(input: ChatGraphInput): Promise<ChatState> {
  const agentConfig = await getAgent(input.agentId || getDefaultAgentId());

  if (!agentConfig) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  return {
    // Input
    messages: input.messages,
    threadId: input.threadId || null,
    agentConfig,
    enabledTools: input.enabledTools || {
      search: true,
      web: true,
      person: true,
      examples: true,
      research: true,
    },
    aiWorkerPool: input.aiWorkerPool,

    // Classification (will be set by classifier node)
    intent: 'direct' as SearchIntent,
    searchQuery: null,
    reasoning: '',

    // Search results (will be set by search node)
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 3,

    // Response (will be set by respond node)
    responseText: '',
    streamingStarted: false,

    // Metadata
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    responseTimeMs: 0,
    error: null,
  };
}

/**
 * Run the ChatGraph for intent classification and search.
 *
 * This function runs the graph synchronously and returns the result.
 * The controller handles streaming using AI SDK v6.
 *
 * The graph will:
 * 1. Classify the user's intent
 * 2. Execute appropriate search if needed
 * 3. Prepare response context (systemMessage in responseText)
 *
 * NOTE: This function is kept for backwards compatibility.
 * The controller can also use chatGraph.invoke() directly.
 */
export async function runChatGraph(input: ChatGraphInput): Promise<ChatGraphOutput> {
  log.info('[ChatGraph] Starting chat processing');

  try {
    // Initialize state
    const initialState = await initializeChatState(input);

    // Run the graph
    const result = await chatGraph.invoke(initialState);

    const totalTimeMs = Date.now() - result.startTime;

    log.info(
      `[ChatGraph] Complete: intent=${result.intent}, searches=${result.searchCount}, time=${totalTimeMs}ms`
    );

    return {
      success: !result.error,
      threadId: result.threadId,
      responseText: result.responseText,
      citations: result.citations,
      metadata: {
        intent: result.intent,
        searchCount: result.searchCount,
        totalTimeMs,
        classificationTimeMs: result.classificationTimeMs,
        searchTimeMs: result.searchTimeMs,
        responseTimeMs: result.responseTimeMs,
      },
      error: result.error || undefined,
    };
  } catch (error: any) {
    log.error('[ChatGraph] Execution error:', error);
    return {
      success: false,
      threadId: input.threadId || null,
      responseText: '',
      citations: [],
      metadata: {
        intent: 'direct',
        searchCount: 0,
        totalTimeMs: 0,
        classificationTimeMs: 0,
        searchTimeMs: 0,
        responseTimeMs: 0,
      },
      error: error.message,
    };
  }
}
