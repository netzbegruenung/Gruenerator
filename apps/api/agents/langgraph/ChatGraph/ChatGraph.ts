/**
 * ChatGraph - LangGraph-Based Agentic Chat
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

import { resolveSkillMention } from '@gruenerator/shared/agents';
import { StateGraph, Annotation } from '@langchain/langgraph';

import {
  isKnownNotebook,
  isUserNotebookId,
  resolveNotebookCollections,
  resolveUserNotebookDocumentIds,
} from '../../../config/notebookCollectionMap.js';
import {
  getAgent,
  getAgentForUser,
  getDefaultAgentId,
} from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';

import { briefGeneratorNode } from './nodes/briefGeneratorNode.js';
import { classifierNode } from './nodes/classifierNode.js';
import { imageNode } from './nodes/imageNode.js';
import { pressemitteilungComposerNode } from './nodes/pressemitteilungComposerNode.js';
import { qualityGateNode } from './nodes/qualityGateNode.js';
import { rerankNode } from './nodes/rerankNode.js';
import { respondNode } from './nodes/respondNode.js';
import { searchNode } from './nodes/searchNode.js';
import { socialMediaComposerNode } from './nodes/socialMediaComposerNode.js';

import type {
  ChatGraphInput,
  ChatGraphOutput,
  SearchIntent,
  SearchSource,
  SearchResult,
  Citation,
  CurrentDocument,
  CurrentBoard,
  ImageStyle,
  ImageEditStyle,
  GatherSource,
  GeneratedImageResult,
  ImageAttachment,
  ThreadAttachment,
  UserLocale,
  ClientPlatform,
  SocialTextPlatform,
  SocialPostPayload,
  ChartData,
  ComputeData,
  ResearchToolResult,
  ExamplesToolResult,
  BtEnrichedResult,
  DocumentSource,
  SynthesisMode,
  WolkeFileRef,
  ConnectFileRef,
} from './types.js';
import type { SubcategoryFilters } from '../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { AIWorkerPool } from '../../../workers/types.js';
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
  aiWorkerPool: Annotation<AIWorkerPool>({
    reducer: (x, y) => y ?? x,
  }),
  userLocale: Annotation<UserLocale>({
    reducer: (x, y) => y ?? x,
  }),
  clientPlatform: Annotation<ClientPlatform>({
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
  hasTabularAttachment: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  clientCanRunPython: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),

  // Notebook scoping (from @notebook mentions)
  notebookIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  notebookCollectionIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  notebookDocumentIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Default notebook scoping (from persistent UI selection)
  defaultNotebookCollectionIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Default-notebook document scope when the agent binds a user-owned notebook.
  defaultNotebookDocumentIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  documentIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Document chat scoping (from @dokumentchat multi-select)
  documentChatIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Board context (from @board mentions)
  boardIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  boardContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Sheet context (from @sheet mentions)
  sheetIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  sheetContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Collaborative document context (from @doc mentions)
  docMentionIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Wolke (Nextcloud) file refs selected via @wolke mentionable.
  wolkeFiles: Annotation<WolkeFileRef[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Connected-account (Nango) file refs selected via @connect mentionable.
  connectFiles: Annotation<ConnectFileRef[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  attachedWebpageUrls: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  // Current open document in the docs editor (primary context for docs surface)
  currentDocument: Annotation<CurrentDocument | null>({
    reducer: (x, y) => y ?? x ?? null,
  }),
  // Live board state in the boards editor (primary context for boards surface)
  currentBoard: Annotation<CurrentBoard | null>({
    reducer: (x, y) => y ?? x ?? null,
  }),
  documentMentionContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Custom system prompt (replaces entire agent system prompt when set)
  customSystemPrompt: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Mention key of the active skill (e.g. 'instagram', 'presse'). When set,
  // respondNode looks up the skill in SKILLS and appends its
  // skillSystemPrompt to the agent's systemRole as an additive section.
  activeSkillMention: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // User profile instructions (additive to all modes)
  userInstructions: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Memory context (from mem0 cross-thread memory)
  memoryContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  memoryRetrieveTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Chat history context (from past conversation search, injected by controller)
  chatHistoryContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Compound query detection (notebook + skill → gather-then-apply pipeline)
  isCompound: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  gatherSources: Annotation<GatherSource[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),

  // Multi-document chat: normalized per-turn doc refs (built by classifier)
  documentSources: Annotation<DocumentSource[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  // Per-source retrieval results (replace when populated, mirrors searchResults)
  perSourceResults: Annotation<Record<string, SearchResult[]>>({
    reducer: (x, y) => {
      if (y && Object.keys(y).length > 0) return y;
      return x ?? {};
    },
  }),
  synthesisMode: Annotation<SynthesisMode>({
    reducer: (x, y) => y ?? x ?? null,
  }),

  // Classification output
  intent: Annotation<SearchIntent>({
    reducer: (x, y) => y ?? x,
  }),
  secondaryIntent: Annotation<SearchIntent | null>({
    reducer: (x, y) => y ?? x,
  }),
  searchSources: Annotation<SearchSource[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  searchQuery: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  subQueries: Annotation<string[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  detectedUrls: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
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
  contentType: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  documentSubtype: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  targetGroupName: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  platform: Annotation<SocialTextPlatform | null>({
    reducer: (x, y) => y ?? x ?? null,
  }),

  // Clarification (HITL interrupt)
  needsClarification: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  clarificationQuestion: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  clarificationOptions: Annotation<string[] | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Metadata filters extracted by classifier (for Qdrant filtering)
  detectedFilters: Annotation<SubcategoryFilters | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Research brief (compressed research intent for complex queries)
  researchBrief: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),

  researchMeta: Annotation<ResearchToolResult | null>({
    reducer: (x, y) => y ?? x,
  }),

  examplesResult: Annotation<ExamplesToolResult | null>({
    reducer: (x, y) => y ?? x,
  }),

  bundestagResult: Annotation<BtEnrichedResult | null>({
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
  // Top cross-encoder score from the most recent rerank pass. Used by the
  // quality gate to short-circuit its LLM coverage check when the top result
  // is clearly strong (avoids a ~150–300ms latency hit on well-formed queries).
  topRerankScore: Annotation<number | null>({
    reducer: (x, y) => y ?? x ?? null,
  }),

  // Reliability flags & structured error log (visibility for silent failure surfaces).
  // searchErrors uses APPEND reducer so errors persist across the qualityGate→search loop;
  // searchResults uses replace, so without append we'd lose failures from prior iterations.
  searchErrors: Annotation<{ source: string; message: string }[]>({
    reducer: (x, y) => [...(x ?? []), ...(y ?? [])],
    default: () => [],
  }),
  briefGenerationFailed: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),
  rerankFailed: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),

  // Image generation
  imagePrompt: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageStyle: Annotation<ImageStyle | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageEditStyle: Annotation<ImageEditStyle | null>({
    reducer: (x, y) => y ?? x,
  }),
  generatedImage: Annotation<GeneratedImageResult | null>({
    reducer: (x, y) => y ?? x,
  }),
  imageTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),
  imageEditDescriptions: Annotation<{ original: string | null; edited: string | null } | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Document summarization
  summaryContext: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  summaryTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Combined social post (EXPERIMENTAL): text half of the social_post intent
  socialPostResult: Annotation<SocialPostPayload | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Chart generation
  chartData: Annotation<ChartData | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Deterministic computation (compute intent)
  computedResult: Annotation<ComputeData | null>({
    reducer: (x, y) => y ?? x,
  }),
  computedResultTimeMs: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
  }),

  // Response generation
  responseText: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  streamingStarted: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
  }),

  // Context window awareness (from model registry)
  contextWindowTokens: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 128000,
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

  // Image edit intent = handled by controller, route to respond for text generation
  if (intent === 'image_edit') {
    log.info('[ChatGraph] Route: classifier → respond (image_edit handled by controller)');
    return 'respond';
  }

  // Summary intent = handled by controller (map-reduce summarization)
  if (intent === 'summary') {
    log.info('[ChatGraph] Route: classifier → respond (summary handled by controller)');
    return 'respond';
  }

  // Chart intent = route to respond, chart data generated by controller
  if (intent === 'chart') {
    log.info('[ChatGraph] Route: classifier → respond (chart handled by controller)');
    return 'respond';
  }

  // Artifact intent = route to respond; the controller extracts the HTML/SVG
  // block from the response and emits it as an `artifact` SSE event.
  if (intent === 'artifact') {
    log.info('[ChatGraph] Route: classifier → respond (artifact handled by controller)');
    return 'respond';
  }

  // Compute intent = route to respond; the controller runs computeNode (plain-JS
  // calculation) in the pipeline and injects the verified result into the prompt.
  if (intent === 'compute') {
    log.info('[ChatGraph] Route: classifier → respond (compute handled by controller)');
    return 'respond';
  }

  // Action intents (save_as_doc, modify_doc, modify_board) = respond first, controller handles action
  // edit_current_doc also falls here: respondNode generates a brief confirmation
  // ("Wende Änderungen an...") while the controller emits a `trigger_doc_edit`
  // SSE event the docs-editor frontend dispatches into BlockNote's AI extension.
  if (
    intent === 'save_as_doc' ||
    intent === 'create_sheet' ||
    intent === 'create_presentation' ||
    intent === 'create_recurring_task' ||
    intent === 'modify_doc' ||
    intent === 'modify_board' ||
    intent === 'edit_current_board' ||
    intent === 'share_doc' ||
    intent === 'edit_current_doc'
  ) {
    log.info(`[ChatGraph] Route: classifier → respond (${intent} handled by controller)`);
    return 'respond';
  }

  // Map intent to tool key for enabled check
  const intentToToolKey: Record<SearchIntent, string> = {
    research: 'research',
    compare: 'search',
    search: 'search',
    // person: 'person', // DISABLED: Person search not production ready
    web: 'web',
    scrape_url: 'scrape',
    examples: 'examples',
    // Combined post rides the examples search; its sharepic half is gated
    // separately in the execution stage (production path).
    social_post: 'examples',
    pressemitteilung_examples: 'pressemitteilung_examples',
    abgeordnetenwatch: 'abgeordnetenwatch',
    bundestag: 'bundestag',
    // System MCP intents route to the agentic loop before this map matters —
    // never user-disableable, so map to 'direct' like agentic.
    bahn: 'direct',
    reise: 'direct',
    hotel: 'direct',
    wetter: 'direct',
    news: 'direct',
    umfragen: 'direct',
    image: 'image',
    image_edit: 'image_edit',
    sharepic: 'sharepic',
    summary: 'summary',
    chart: 'chart',
    artifact: 'artifact',
    compute: 'compute',
    save_as_doc: 'save_as_doc',
    modify_doc: 'modify_doc',
    edit_current_doc: 'edit_current_doc',
    modify_board: 'modify_board',
    edit_current_board: 'edit_current_board',
    share_doc: 'share_doc',
    create_sheet: 'create_sheet',
    create_presentation: 'create_presentation',
    create_recurring_task: 'create_recurring_task',
    chat_history: 'chat_history',
    mcp: 'mcp',
    direct: 'direct',
    // Demoted loop turns are never user-disableable (the loop gates its own tools).
    agentic: 'direct',
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
function routeAfterQualityGate(
  state: ChatState
): 'search' | 'respond' | 'pressemitteilungComposer' | 'socialMediaComposer' {
  const { qualityScore, searchCount, maxSearches } = state;

  // Loop back to search if quality is insufficient and we have retries left
  if (qualityScore > 0 && qualityScore < 3 && searchCount < maxSearches) {
    log.info(
      `[ChatGraph] Route: qualityGate → search (score: ${qualityScore}/5, search ${searchCount}/${maxSearches})`
    );
    return 'search';
  }

  // Press-intent gets its own composer node — same downstream streaming path,
  // different prompt and (controller-level) different model.
  if (state.intent === 'pressemitteilung_examples') {
    log.info(
      `[ChatGraph] Route: qualityGate → pressemitteilungComposer (score: ${qualityScore}/5)`
    );
    return 'pressemitteilungComposer';
  }

  // Social-creation intent gets its sibling composer node. Same shape as
  // press: prompt-builder writes responseText, controller streams via Gemma 4.
  if (state.intent === 'examples') {
    log.info(`[ChatGraph] Route: qualityGate → socialMediaComposer (score: ${qualityScore}/5)`);
    return 'socialMediaComposer';
  }

  log.info(`[ChatGraph] Route: qualityGate → respond (score: ${qualityScore}/5)`);
  return 'respond';
}

/**
 * Create the ChatGraph.
 *
 * Graph structure:
 *   START → classifier → [conditional: search|image|respond]
 *   search → rerank → qualityGate → [conditional: search|respond|pressemitteilungComposer]
 *   image → respond
 *   pressemitteilungComposer → END   (PM-specific prompt; controller streams via Gemma 4)
 *   respond → END
 */
function createChatGraph() {
  const graph = new StateGraph(ChatStateAnnotation)
    // Add nodes
    // LangGraph's StateGraph.addNode expects the Annotation-inferred state shape,
    // but our node functions are typed against ChatGraphState interface.
    // The shapes are identical at runtime — this cast bridges the two type systems.
    .addNode('classifier', classifierNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode(
      'briefGenerator',
      briefGeneratorNode as (state: ChatState) => Promise<Partial<ChatState>>
    )
    .addNode('search', searchNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode('rerank', rerankNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode('qualityGate', qualityGateNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode('image', imageNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode('respond', respondNode as (state: ChatState) => Promise<Partial<ChatState>>)
    .addNode(
      'pressemitteilungComposer',
      pressemitteilungComposerNode as (state: ChatState) => Promise<Partial<ChatState>>
    )
    .addNode(
      'socialMediaComposer',
      socialMediaComposerNode as (state: ChatState) => Promise<Partial<ChatState>>
    )

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
      pressemitteilungComposer: 'pressemitteilungComposer',
      socialMediaComposer: 'socialMediaComposer',
    })

    // image → respond
    .addEdge('image', 'respond')

    // respond → END
    .addEdge('respond', '__end__')

    // pressemitteilungComposer → END (controller streams from state.responseText)
    .addEdge('pressemitteilungComposer', '__end__')

    // socialMediaComposer → END (controller streams from state.responseText)
    .addEdge('socialMediaComposer', '__end__');

  return graph.compile();
}

// Module-level compiled graph (compiled once, reused for all requests)
export const chatGraph = createChatGraph();

/**
 * Initialize state from input.
 * Loads agent configuration and sets up initial state.
 */
export async function initializeChatState(input: ChatGraphInput): Promise<ChatState> {
  const agentId = input.agentId || getDefaultAgentId();
  // User-created agents (`user_agents`) and custom-generator agents (`cg-*`) are
  // keyed by userId, so resolve through the user-aware loader when we have one.
  // Without a userId (tests, non-HTTP callers) only system agents resolve.
  let agentConfig = input.userId
    ? await getAgentForUser(agentId, input.userId)
    : await getAgent(agentId);

  if (!agentConfig) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  // Skill mentions carry the identifier of their owning agent (e.g.
  // /presse-berlin → gruenerator-oeffentlichkeitsarbeit-berlin). On the
  // default agent, adopt that agent's scoping (defaultFilter +
  // toolRestrictions) so search_documents and pressemitteilung_examples are
  // pinned to the matching Landesverband. The skill body carries the voice;
  // model, provider and systemRole of the active agent stay untouched, and an
  // explicitly selected non-default agent always wins.
  if (input.activeSkillMention && agentId === getDefaultAgentId()) {
    const skillAgentId = resolveSkillMention(input.activeSkillMention);
    if (skillAgentId && skillAgentId !== agentConfig.identifier) {
      const skillAgent = await getAgent(skillAgentId);
      if (skillAgent && (skillAgent.defaultFilter != null || skillAgent.toolRestrictions != null)) {
        agentConfig = {
          ...agentConfig,
          ...(skillAgent.defaultFilter != null && { defaultFilter: skillAgent.defaultFilter }),
          ...(skillAgent.toolRestrictions != null && {
            toolRestrictions: skillAgent.toolRestrictions,
          }),
        };
        log.info(
          `[ChatGraph] Skill ${input.activeSkillMention} adopted scoping from agent ${skillAgentId}`
        );
      }
    }
  }

  // [agent-trace] Prove what the backend actually resolved for this turn — the
  // running shared package can be stale (dist vs source), so log the resolved
  // identifier alongside the LV-relevant config that drives PM/example scoping.
  log.info(
    `[ChatGraph][agent-trace] requested="${input.agentId ?? '(none)'}" resolved="${agentConfig.identifier}" ` +
      `systemRole=${agentConfig.systemRole ? `${agentConfig.systemRole.length}chars "${agentConfig.systemRole.slice(0, 60).replace(/\s+/g, ' ')}…"` : 'MISSING'} ` +
      `defaultFilter=${JSON.stringify(agentConfig.defaultFilter ?? null)} ` +
      `examplesLvScope=${JSON.stringify(agentConfig.toolRestrictions?.examplesLvScope ?? null)}`
  );

  // Default notebook scoping: the agent's bound notebooks (server-authoritative,
  // read from the loaded agent record) UNIONed with the user's single composer
  // pick (`input.defaultNotebookId`, always a system slug here — user-UUID picks
  // arrive pre-resolved as `defaultNotebookDocumentIds` from streamContext).
  // System slugs → collections; user-UUID notebooks → ownership-checked doc IDs.
  // @notebook mentions (`notebookCollectionIds`) still hard-override these downstream.
  const agentNotebookIds = agentConfig.defaultNotebookIds ?? [];
  const defaultNotebookSlugs = [
    ...agentNotebookIds.filter(isKnownNotebook),
    ...(input.defaultNotebookId && isKnownNotebook(input.defaultNotebookId)
      ? [input.defaultNotebookId]
      : []),
  ];
  const agentUserNotebookUuids = agentNotebookIds.filter(isUserNotebookId);
  const agentNotebookDocumentIds =
    agentUserNotebookUuids.length > 0 && input.userId
      ? (await resolveUserNotebookDocumentIds(input.userId, agentUserNotebookUuids)).documentIds
      : [];

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
    userLocale: input.userLocale || 'de-DE',
    clientPlatform: input.clientPlatform || 'web',

    // Attachment context
    attachmentContext: input.attachmentContext || null,
    imageAttachments: input.imageAttachments || [],
    threadAttachments: input.threadAttachments || [],
    hasTabularAttachment: input.hasTabularAttachment ?? false,
    clientCanRunPython: input.clientCanRunPython ?? false,

    // Notebook scoping
    notebookIds: input.notebookIds || [],
    notebookCollectionIds: input.notebookIds ? resolveNotebookCollections(input.notebookIds) : [],
    notebookDocumentIds: input.notebookDocumentIds ?? [],

    // Default notebook scoping: agent's bound notebooks + composer pick (above).
    defaultNotebookCollectionIds: resolveNotebookCollections(defaultNotebookSlugs),
    defaultNotebookDocumentIds: [
      ...new Set([...(input.defaultNotebookDocumentIds ?? []), ...agentNotebookDocumentIds]),
    ],

    // Document scoping (from @datei mentions)
    documentIds: input.documentIds || [],

    // Document chat scoping (from @dokumentchat multi-select)
    documentChatIds: input.documentChatIds || [],

    // Board context (from @board mentions, populated by controller)
    boardIds: input.boardIds || [],
    boardContext: null,

    // Sheet context (from @sheet mentions, populated by controller)
    sheetIds: input.sheetIds || [],
    sheetContext: null,

    // Collaborative document context (from @doc mentions, populated by controller)
    docMentionIds: input.docMentionIds || [],
    documentMentionContext: null,

    // Wolke (Nextcloud) file refs (from @wolke mentionable, validated by controller)
    wolkeFiles: input.wolkeFiles || [],

    // Connected-account (Nango) file refs (from @connect mentionable)
    connectFiles: input.connectFiles || [],

    // URLs attached via @web mentionable (unioned into detectedUrls by classifier)
    attachedWebpageUrls: input.attachedWebpageUrls || [],

    // Current open document (docs editor surface)
    currentDocument: input.currentDocument || null,

    // Live board (boards editor surface)
    currentBoard: input.currentBoard || null,

    // Custom system prompt (from thread or user settings)
    customSystemPrompt: input.customSystemPrompt || null,

    // Active skill (drives platform-specific prompt fragment in respondNode)
    activeSkillMention: input.activeSkillMention || null,

    // User profile instructions (from profiles.custom_prompt)
    userInstructions: input.userInstructions || null,

    // Memory context (will be set by controller before graph execution)
    memoryContext: null,
    memoryRetrieveTimeMs: 0,

    // Chat history context (will be set by controller when classifier detects past conversation reference)
    chatHistoryContext: null,

    // Compound query detection (will be set by classifier node)
    isCompound: false,
    gatherSources: [],

    // Multi-document chat (will be set by classifier node)
    documentSources: [],
    perSourceResults: {},
    synthesisMode: null,

    // Classification (will be set by classifier node)
    intent: 'direct' as SearchIntent,
    secondaryIntent: null,
    searchSources: [],
    searchQuery: null,
    subQueries: null,
    detectedUrls: [],
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,
    contentType: null,
    documentSubtype: null,
    targetGroupName: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    platform: null,

    // Research brief (will be set by briefGenerator node for complex research)
    researchBrief: null,
    researchMeta: null,
    examplesResult: null,
    bundestagResult: null,

    // Search results (will be set by search node)
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,

    // Quality gate
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,

    // Reliability flags & structured error log
    searchErrors: [],
    briefGenerationFailed: false,
    rerankFailed: false,
    topRerankScore: null,

    // Image generation (will be set by image node)
    imagePrompt: null,
    imageStyle: null,
    imageEditStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    imageEditDescriptions: null,

    // Document summarization (will be set by summarizeNode)
    summaryContext: null,
    summaryTimeMs: 0,

    // Combined social post (set by the execution stage for social_post)
    socialPostResult: null,

    // Chart generation (will be set by chart node)
    chartData: null,

    // Deterministic computation: seeded from a client-side spreadsheet result
    // when present (follow-up turns), otherwise set by computeNode.
    computedResult: input.computedResult ?? null,
    computedResultTimeMs: 0,

    // Response (will be set by respond node)
    responseText: '',
    streamingStarted: false,

    // Context window awareness
    contextWindowTokens: input.contextWindowTokens || 128000,

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

    // Reliability summary — only log when something noteworthy happened so the line
    // stays useful for grep instead of getting drowned in happy-path noise.
    const errCount = result.searchErrors?.length ?? 0;
    if (errCount > 0 || result.rerankFailed || result.briefGenerationFailed) {
      const errSources = result.searchErrors?.map((e) => e.source).join(',') || 'none';
      log.warn(
        `[ChatGraph] Reliability: errors=${errCount} (${errSources}), rerankFailed=${!!result.rerankFailed}, briefFailed=${!!result.briefGenerationFailed}, results=${result.searchResults.length}`
      );
    }

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
        appliedFilters: result.detectedFilters || undefined,
        imageTimeMs: result.imageTimeMs || undefined,
        responseTimeMs: result.responseTimeMs,
      },
      error: result.error || undefined,
    };
  } catch (error: unknown) {
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
