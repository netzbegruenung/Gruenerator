/**
 * ChatGraph - LangGraph-Based Agentic Chat
 *
 * Solves the AI SDK toolChoice: 'required' loop trap by providing explicit
 * control flow for chat with search capabilities.
 *
 * Graph flow:
 *   START → classifier → [briefGenerator|search|image|respond] → ... → respond → END
 *
 * The classifier determines intent, and the graph routes accordingly:
 * - complex research → briefGenerator → search → rerank → qualityGate → respond
 * - search intents → search node → rerank node → respond node
 * - image intent → image node → respond node
 * - direct intent → respond node directly
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';

import { getAgent, getDefaultAgentId } from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';

import { briefGeneratorNode } from './nodes/briefGeneratorNode.js';
import { classifierNode } from './nodes/classifierNode.js';
import { imageNode } from './nodes/imageNode.js';
import { qualityGateNode } from './nodes/qualityGateNode.js';
import { rerankNode } from './nodes/rerankNode.js';
import { respondNode } from './nodes/respondNode.js';
import { searchNode } from './nodes/searchNode.js';

import type {
  ChatGraphState,
  ChatGraphInput,
  ChatGraphOutput,
  SearchIntent,
  SearchResult,
  Citation,
  ImageStyle,
  GeneratedImageResult,
  ImageAttachment,
  ThreadAttachment,
} from './types.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { ModelMessage } from 'ai';

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

  // Attachment context
  attachmentContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageAttachments: Annotation<ImageAttachment[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  threadAttachments: Annotation<ThreadAttachment[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Memory context (from mem0 cross-thread memory)
  memoryContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  memoryRetrieveTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Classification output
  intent: Annotation<SearchIntent>({
    reducer: (x, y) => y ?? x,
  }),
  searchQuery: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  subQueries: Annotation<string[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  reasoning: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  hasTemporal: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  complexity: Annotation<'simple' | 'moderate' | 'complex'>({
    reducer: (x, y) => y ?? x ?? 'moderate',
  }),

  // Research brief (compressed research intent for complex queries)
  researchBrief: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Search results (replaced by each node — search sets initial results, rerank replaces with filtered set)
  searchResults: Annotation<SearchResult[]>({
    reducer: (x, y) => {
      if (y && y.length > 0) {
        return y;
      }
      return x || [];
    },
  }),
  citations: Annotation<Citation[]>({
    reducer: (x, y) => {
      if (y && y.length > 0) {
        return y;
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

  // Quality gate (iterative search)
  qualityScore: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  qualityAssessmentTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Image generation
  imagePrompt: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageStyle: Annotation<ImageStyle | null>({
    reducer: (x, y) => y ?? x,
  }),
  generatedImage: Annotation<GeneratedImageResult | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
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
  rerankTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  searchedCollections: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
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
 * Routing function: After classification, decide search, image, or respond.
 *
 * Routes to 'image' if:
 * - Intent is 'image' (image generation request)
 * - The image tool is enabled
 *
 * Routes to 'search' if:
 * - Intent is a search intent (research, search, person, web, examples)
 * - The required tool is enabled
 *
 * Routes to 'respond' if:
 * - Intent is 'direct'
 * - The required tool is disabled
 */
function routeAfterClassification(
  state: ChatState
): 'briefGenerator' | 'search' | 'image' | 'respond' {
  const { intent, enabledTools, complexity } = state;

  // Direct intent = no search or image needed
  if (intent === 'direct') {
    log.info('[ChatGraph] Route: classifier → respond (direct intent)');
    return 'respond';
  }

  // Image intent = route to image generation
  if (intent === 'image') {
    // Check if image tool is enabled
    if (enabledTools && enabledTools['image'] === false) {
      log.info('[ChatGraph] Route: classifier → respond (image tool disabled)');
      return 'respond';
    }
    log.info('[ChatGraph] Route: classifier → image (image intent)');
    return 'image';
  }

  // Map intent to tool key for enabled check
  const intentToToolKey: Record<SearchIntent, string> = {
    research: 'research',
    search: 'search',
    // person: 'person', // DISABLED: Person search not production ready
    web: 'web',
    examples: 'examples',
    image: 'image',
    direct: 'direct',
  };

  const toolKey = intentToToolKey[intent];

  // Check if the required tool is enabled
  if (enabledTools && enabledTools[toolKey] === false) {
    log.info(`[ChatGraph] Route: classifier → respond (tool "${toolKey}" disabled)`);
    return 'respond';
  }

  // Complex research queries: generate a research brief first
  if (complexity === 'complex' && intent === 'research') {
    log.info('[ChatGraph] Route: classifier → briefGenerator (complex research)');
    return 'briefGenerator';
  }

  log.info(`[ChatGraph] Route: classifier → search (intent: ${intent})`);
  return 'search';
}

/**
 * Routing function: After quality gate, decide whether to loop back to search or proceed to respond.
 *
 * Routes to 'search' if:
 * - Quality score < 3 (insufficient coverage)
 * - A refined query was suggested
 * - searchCount < maxSearches (haven't exceeded retry limit)
 *
 * Routes to 'respond' otherwise.
 */
function routeAfterQualityGate(state: ChatState): 'search' | 'respond' {
  const { qualityScore, searchQuery, searchCount, maxSearches } = state;

  // Loop back to search if quality is insufficient and we have retries left
  if (qualityScore > 0 && qualityScore < 3 && searchCount < maxSearches) {
    log.info(
      `[ChatGraph] Route: qualityGate → search (score: ${qualityScore}/5, search ${searchCount}/${maxSearches})`
    );
    return 'search';
  }

  log.info(`[ChatGraph] Route: qualityGate → respond (score: ${qualityScore}/5)`);
  return 'respond';
}

/**
 * Create the ChatGraph.
 *
 * Graph structure:
 *   START → classifier → [conditional: search|image|respond]
 *   search → rerank → qualityGate → [conditional: search|respond]
 *   image → respond
 *   respond → END
 */
function createChatGraph() {
  const graph = new StateGraph(ChatStateAnnotation)
    // Add nodes
    .addNode('classifier', classifierNode as any)
    .addNode('briefGenerator', briefGeneratorNode as any)
    .addNode('search', searchNode as any)
    .addNode('rerank', rerankNode as any)
    .addNode('qualityGate', qualityGateNode as any)
    .addNode('image', imageNode as any)
    .addNode('respond', respondNode as any)

    // START → classifier
    .addEdge('__start__', 'classifier')

    // classifier → conditional routing (including briefGenerator for complex research)
    .addConditionalEdges('classifier', routeAfterClassification, {
      briefGenerator: 'briefGenerator',
      search: 'search',
      image: 'image',
      respond: 'respond',
    })

    // briefGenerator → search (always proceeds to search after generating brief)
    .addEdge('briefGenerator', 'search')

    // search → rerank → qualityGate → [conditional: search OR respond]
    .addEdge('search', 'rerank')
    .addEdge('rerank', 'qualityGate')
    .addConditionalEdges('qualityGate', routeAfterQualityGate, {
      search: 'search',
      respond: 'respond',
    })

    // image → respond
    .addEdge('image', 'respond')

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
      image: true,
    },
    aiWorkerPool: input.aiWorkerPool,

    // Attachment context
    attachmentContext: input.attachmentContext || null,
    imageAttachments: input.imageAttachments || [],
    threadAttachments: input.threadAttachments || [],

    // Memory context (will be set by controller before graph execution)
    memoryContext: null,
    memoryRetrieveTimeMs: 0,

    // Classification (will be set by classifier node)
    intent: 'direct' as SearchIntent,
    searchQuery: null,
    subQueries: null,
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,

    // Research brief (will be set by briefGenerator node for complex research)
    researchBrief: null,

    // Search results (will be set by search node)
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,

    // Quality gate
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,

    // Image generation (will be set by image node)
    imagePrompt: null,
    imageStyle: null,
    generatedImage: null,
    imageTimeMs: 0,

    // Response (will be set by respond node)
    responseText: '',
    streamingStarted: false,

    // Metadata
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
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
      `[ChatGraph] Complete: intent=${result.intent}, searches=${result.searchCount}, image=${result.generatedImage ? 'yes' : 'no'}, time=${totalTimeMs}ms`
    );

    return {
      success: !result.error,
      threadId: result.threadId,
      responseText: result.responseText,
      citations: result.citations,
      generatedImage: result.generatedImage,
      metadata: {
        intent: result.intent,
        searchCount: result.searchCount,
        totalTimeMs,
        classificationTimeMs: result.classificationTimeMs,
        searchTimeMs: result.searchTimeMs,
        rerankTimeMs: result.rerankTimeMs || undefined,
        searchedCollections: result.searchedCollections?.length
          ? result.searchedCollections
          : undefined,
        imageTimeMs: result.imageTimeMs || undefined,
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
