/**
 * ChatGraph Type Definitions
 *
 * Defines the state structure and types for the LangGraph-based chat system.
 * This provides explicit control flow for agentic chat, solving the AI SDK
 * toolChoice: 'required' loop trap.
 *
 * NOTE: req/res are intentionally NOT part of the graph state.
 * The controller handles HTTP streaming via the @ai-sdk/langchain adapter,
 * keeping the graph decoupled from transport concerns.
 */

import type { SubcategoryFilters } from '../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { AIWorkerPool } from '../../../workers/types.js';
import type { ModelMessage } from 'ai';

/**
 * Search source backends that can be queried in parallel.
 * When multiple sources are specified, the search node runs them concurrently
 * and merges/deduplicates the results before reranking.
 */
export type SearchSource = 'documents' | 'web' | 'examples' | 'chat_history' | 'wolke';

/**
 * Supported user locales for locale-aware collection routing.
 * Austrian users (de-AT) get Austrian collections, German users (de-DE) get German defaults.
 */
export type UserLocale = 'de-DE' | 'de-AT';

/**
 * Intent classification for routing to appropriate search tools.
 * The classifier determines which intent applies, and the graph routes accordingly.
 */
export type SearchIntent =
  | 'research' // Complex multi-source research ("recherchiere", "finde heraus")
  | 'search' // Gruenerator document search (party programs, positions)
  // | 'person' // DISABLED: Person search not production ready (only searches 80 cached MPs)
  | 'web' // Web search (current events, external facts)
  | 'examples' // Social media examples/templates
  | 'image' // Image generation ("erstelle bild", "generiere", "visualisiere")
  | 'image_edit' // Image editing ("stadt begrünen", green urban transformation)
  | 'sharepic' // Sharepic creation ("erstelle sharepic", "@sharepic")
  | 'summary' // Document summarization ("fasse zusammen", "zusammenfassung")
  | 'chart' // Data visualization ("erstelle Diagramm", "Balkendiagramm")
  | 'save_as_doc' // Save response as document ("speichere als Dokument")
  | 'modify_doc' // Modify mentioned document ("ändere", "ergänze" with @doc) — for /chat surface
  | 'edit_current_doc' // Live-edit the open document via BlockNote AI — for docs editor surface
  | 'modify_board' // Modify mentioned board ("füge Aufgabe hinzu" with @board)
  | 'share_doc' // Share document with group ("teile mit Gruppe", "share mit AG")
  | 'direct'; // No search needed (greetings, creative tasks without fact needs)

/**
 * Image style for generation.
 */
export type ImageStyle = 'illustration' | 'realistic' | 'pixel' | 'green-edit' | 'universal';

/**
 * FLUX edit-prompt builder selector for `image_edit` intent.
 * `green-edit` preserves the @stadtbegruenen branded behaviour;
 * `universal` feeds the user's instruction to FLUX as-is.
 */
export type ImageEditStyle = 'green-edit' | 'universal';

/**
 * Processed file attachment from the frontend.
 */
export interface ProcessedAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
  isImage: boolean;
}

/**
 * Image attachment for vision models.
 */
export interface ImageAttachment {
  name: string;
  type: string;
  data: string;
}

/**
 * Result from image generation.
 */
export interface GeneratedImageResult {
  base64: string;
  url: string;
  filename: string;
  prompt: string;
  style: ImageStyle;
  generationTimeMs: number;
}

/**
 * Source prefixes used in SearchResult.source to identify result provenance.
 * Use these instead of raw strings to avoid silent mismatches across the pipeline.
 */
export const SOURCE_PREFIX = {
  GRUENERATOR: 'gruenerator:',
  WEB: 'web',
  EXAMPLES: 'examples',
  RESEARCH: 'research',
  RESEARCH_SYNTHESIS: 'research_synthesis',
  DOCUMENT: 'document',
  DOCUMENT_CHAT: 'documentchat:',
} as const;

/**
 * Unified search result structure from any tool.
 */
export interface SearchResult {
  source: string;
  title: string;
  content: string;
  url?: string | undefined;
  relevance?: number | undefined;
  contentType?: string | undefined;
  documentId?: string | undefined;
  chunkIndex?: number | undefined;
  similarityScore?: number | undefined;
  collectionId?: string | undefined;
  [key: string]: unknown;
}

/**
 * Citation structure for response attribution.
 * Enriched with provenance data for inline popovers and grouped source cards.
 */
export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
  citedText?: string | undefined;
  source: string;
  collectionName?: string | undefined;
  domain?: string | undefined;
  relevance?: number | undefined;
  contentType?: string | undefined;
  documentId?: string | undefined;
  chunkIndex?: number | undefined;
  similarityScore?: number | undefined;
  collectionId?: string | undefined;
}

/**
 * Research tool result shape persisted into `chat_messages.tool_calls[].result`.
 * Mirrors the contract that `ResearchResultUI` reads in the chat package
 * (`packages/chat/src/components/ToolCallUI.tsx#ResearchResultUI`).
 *
 * `citations` here uses the enriched `Citation` shape (not `ResearchCitation`)
 * because the search node has already run citation enrichment on the results.
 */
export interface ResearchToolResult {
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  searchSteps: Array<{ tool: string; query: string; resultsCount: number }>;
  followUpQuestions: string[];
}

/**
 * Persisted thread attachment with summary for context in subsequent messages.
 */
export interface ThreadAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  summary: string | null;
  createdAt: Date;
}

/**
 * Input to the ChatGraph.
 * Provided by the route controller when invoking the graph.
 *
 * NOTE: Does not include req/res - HTTP streaming is handled by the controller
 * using the @ai-sdk/langchain adapter.
 */
/**
 * Open document the user is currently editing — primary conversation context for
 * the docs-editor surface. Distinct from `documentChatIds` (explicit @dokumentchat
 * retrieval scope) and `attachmentContext` (uploaded files): this IS the document
 * being talked about.
 */
export interface CurrentDocument {
  id: string;
  title: string | null;
  markdown: string;
  selectionText: string | null;
}

export interface ChatGraphInput {
  messages: ModelMessage[];
  threadId?: string | undefined;
  agentId: string;
  enabledTools: Record<string, boolean>;
  aiWorkerPool: AIWorkerPool;
  attachmentContext?: string | undefined;
  imageAttachments?: ImageAttachment[] | undefined;
  threadAttachments?: ThreadAttachment[] | undefined;
  notebookIds?: string[] | undefined;
  defaultNotebookId?: string | undefined;
  documentIds?: string[] | undefined;
  textIds?: string[] | undefined;
  documentChatIds?: string[] | undefined;
  boardIds?: string[] | undefined;
  docMentionIds?: string[] | undefined;
  currentDocument?: CurrentDocument | undefined;
  userLocale?: UserLocale | undefined;
  customSystemPrompt?: string | undefined;
  userInstructions?: string | undefined;
  contextWindowTokens?: number | undefined;
}

/**
 * Internal state during graph execution.
 * Contains input (immutable after init), intermediate results, and metadata.
 *
 * NOTE: Does not include req/res - the graph is decoupled from HTTP.
 * Streaming is handled by the controller via @ai-sdk/langchain adapter.
 */
export interface ChatGraphState {
  // Input (immutable after initialization)
  messages: ModelMessage[];
  threadId: string | null;
  agentConfig: AgentConfig;
  enabledTools: Record<string, boolean>;
  aiWorkerPool: AIWorkerPool;
  userLocale: UserLocale;

  // Optional progress sink. Set by the controller for tools that produce
  // multi-phase progress (deep research). Pure callback — graph stays
  // HTTP-decoupled (no Response object on state).
  onResearchProgress?: ((message: string) => void) | undefined;

  // Attachment context
  attachmentContext: string | null;
  imageAttachments: ImageAttachment[];
  threadAttachments: ThreadAttachment[];

  // Notebook scoping (from @notebook mentions)
  notebookIds: string[];
  notebookCollectionIds: string[];

  // Default notebook scoping (from persistent UI selection)
  defaultNotebookCollectionIds: string[];

  // Document scoping (from @datei mentions)
  documentIds: string[];

  // Document chat scoping (from @dokumentchat multi-select)
  documentChatIds: string[];

  // Board context (from @board mentions)
  boardIds: string[];
  boardContext: string | null;

  // Collaborative document context (from @doc mentions)
  docMentionIds: string[];
  documentMentionContext: string | null;

  // Current open document in the docs editor (primary context, not retrieval scope).
  // Set when chat is embedded in a document editor surface.
  currentDocument: CurrentDocument | null;

  // Custom system prompt (replaces entire agent system prompt when set)
  customSystemPrompt: string | null;

  // User profile instructions (from profiles.custom_prompt, additive to all modes)
  userInstructions: string | null;

  // Memory context (from mem0 cross-thread memory)
  memoryContext: string | null;
  memoryRetrieveTimeMs: number;

  // Chat history context (from past conversation search, injected by controller)
  chatHistoryContext: string | null;

  // Compound query detection (notebook + skill → gather-then-apply pipeline)
  isCompound: boolean;
  gatherSources: GatherSource[];

  // Classification output
  intent: SearchIntent;
  secondaryIntent: SearchIntent | null;
  searchSources: SearchSource[];
  searchQuery: string | null;
  subQueries: string[] | null;
  reasoning: string;
  contentType: string | null;
  documentSubtype: string | null;
  targetGroupName: string | null;
  hasTemporal: boolean;
  complexity: 'simple' | 'moderate' | 'complex';

  // Clarification (HITL interrupt)
  needsClarification: boolean;
  clarificationQuestion: string | null;
  clarificationOptions: string[] | null;

  // Metadata filters extracted by classifier (for Qdrant filtering)
  detectedFilters: SubcategoryFilters | null;

  // Search results (accumulated)
  searchResults: SearchResult[];
  citations: Citation[];
  searchCount: number;
  maxSearches: number;

  // Research brief (compressed research intent for complex queries)
  researchBrief: string | null;

  // Full research metadata (set by search node when intent === 'research').
  // Persisted into the `research` tool-call result so the UI can render
  // confidence, search steps, and follow-up questions.
  researchMeta: ResearchToolResult | null;

  // Quality gate (iterative search)
  qualityScore: number;
  qualityAssessmentTimeMs: number;

  // Reliability flags & structured error log
  searchErrors: { source: string; message: string }[];
  briefGenerationFailed: boolean;
  rerankFailed: boolean;

  // Image generation
  imagePrompt: string | null;
  imageStyle: ImageStyle | null;
  imageEditStyle: ImageEditStyle | null;
  generatedImage: GeneratedImageResult | null;
  imageTimeMs: number;
  imageEditDescriptions: { original: string | null; edited: string | null } | null;

  // Document summarization
  summaryContext: string | null;
  summaryTimeMs: number;

  // Chart generation
  chartData: ChartData | null;

  // Response generation
  responseText: string;
  streamingStarted: boolean;

  // Context window awareness (from model registry)
  contextWindowTokens: number;

  // Metadata for observability
  startTime: number;
  classificationTimeMs: number;
  searchTimeMs: number;
  rerankTimeMs: number;
  searchedCollections: string[];
  responseTimeMs: number;
  error: string | null;
}

/**
 * Output from the ChatGraph after completion.
 * This is what the controller receives after graph execution.
 */
export interface ChatGraphOutput {
  success: boolean;
  threadId: string | null;
  responseText: string;
  citations: Citation[];
  generatedImage?: GeneratedImageResult | null | undefined;
  metadata: {
    intent: SearchIntent;
    searchCount: number;
    totalTimeMs: number;
    classificationTimeMs: number;
    searchTimeMs: number;
    rerankTimeMs?: number | undefined;
    searchedCollections?: string[] | undefined;
    appliedFilters?: SubcategoryFilters | null | undefined;
    imageTimeMs?: number | undefined;
    memoryRetrieveTimeMs?: number | undefined;
    responseTimeMs: number;
  };
  error?: string | undefined;
}

/**
 * Gather sources for compound queries.
 * When a user combines a data source (@notebook) with a skill (@pressemitteilung),
 * the classifier returns which sources to gather context from before response generation.
 */
export type GatherSource = 'notebook-search' | 'web-search' | 'research';

/**
 * Classification result from the classifier node.
 */
export interface ClassificationResult {
  intent: SearchIntent;
  secondaryIntent?: SearchIntent | null | undefined;
  searchSources?: SearchSource[] | undefined;
  searchQuery: string | null;
  subQueries?: string[] | null | undefined;
  filters?: SubcategoryFilters | null | undefined;
  reasoning: string;
  contentType?: string | null | undefined;
  needsClarification?: boolean | undefined;
  clarificationQuestion?: string | undefined;
  clarificationOptions?: string[] | undefined;
  gatherSources?: GatherSource[] | undefined;
  documentSubtype?: string | null | undefined;
  targetGroupName?: string | null | undefined;
}

/**
 * Chart data for visualization.
 * Generated by the chart node and sent to the frontend via SSE.
 */
export interface ChartData {
  type: 'bar' | 'line' | 'area' | 'pie' | 'donut';
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
  colors?: string[] | undefined;
}

/**
 * Confirm action types for HITL (Human-In-The-Loop) confirmation.
 * Used when the agent wants to perform a side-effect that requires user approval.
 */
export type ConfirmActionType = 'save_as_doc' | 'modify_doc' | 'modify_board' | 'share_doc';

/**
 * Type-safe payloads for each confirm action type.
 */
export interface SaveAsDocPayload {
  content: string;
  title: string;
  subtype: string;
}

export interface ModifyDocPayload {
  docId: string;
  newContent: string;
}

export interface ModifyBoardPayload {
  boardId: string;
  rows: Array<Record<string, unknown>>;
  responseText: string;
}

export interface ShareDocPayload {
  docId: string;
  docTitle: string;
  groupId: string;
  groupName: string;
  permissionLevel: 'viewer' | 'editor';
}

/**
 * Pending action stored in Redis while awaiting user confirmation.
 * Discriminated union ensures type-safe payload access per action type.
 */
export type PendingAction = {
  actionId: string;
  threadId: string;
  userId: string;
  title: string;
  preview: string;
  createdAt: number;
} & (
  | { type: 'save_as_doc'; payload: SaveAsDocPayload }
  | { type: 'modify_doc'; payload: ModifyDocPayload }
  | { type: 'modify_board'; payload: ModifyBoardPayload }
  | { type: 'share_doc'; payload: ShareDocPayload }
);

/**
 * Chat search result from searching past conversations.
 */
export interface ChatSearchResult {
  threadId: string;
  threadTitle: string | null;
  agentId: string;
  snippet: string;
  messageRole: 'user' | 'assistant';
  matchedAt: string;
  threadUpdatedAt: string;
}
