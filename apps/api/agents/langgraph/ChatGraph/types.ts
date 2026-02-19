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
import type { ModelMessage } from 'ai';

/**
 * Search source backends that can be queried in parallel.
 * When multiple sources are specified, the search node runs them concurrently
 * and merges/deduplicates the results before reranking.
 */
export type SearchSource = 'documents' | 'web';

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
  | 'direct'; // No search needed (greetings, creative tasks without fact needs)

/**
 * Image style for generation.
 */
export type ImageStyle = 'illustration' | 'realistic' | 'pixel' | 'green-edit';

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
 * Unified search result structure from any tool.
 */
export interface SearchResult {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance?: number;
  contentType?: string;
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
  citedText?: string;
  source: string;
  collectionName?: string;
  domain?: string;
  relevance?: number;
  contentType?: string;
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
export interface ChatGraphInput {
  messages: ModelMessage[];
  threadId?: string;
  agentId: string;
  enabledTools: Record<string, boolean>;
  aiWorkerPool: any;
  attachmentContext?: string;
  imageAttachments?: ImageAttachment[];
  threadAttachments?: ThreadAttachment[];
  notebookIds?: string[];
  defaultNotebookId?: string;
  documentIds?: string[];
  textIds?: string[];
  documentChatIds?: string[];
  userLocale?: UserLocale;
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
  aiWorkerPool: any;
  userLocale: UserLocale;

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

  // Memory context (from mem0 cross-thread memory)
  memoryContext: string | null;
  memoryRetrieveTimeMs: number;

  // Classification output
  intent: SearchIntent;
  searchSources: SearchSource[];
  searchQuery: string | null;
  subQueries: string[] | null;
  reasoning: string;
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

  // Quality gate (iterative search)
  qualityScore: number;
  qualityAssessmentTimeMs: number;

  // Image generation
  imagePrompt: string | null;
  imageStyle: ImageStyle | null;
  generatedImage: GeneratedImageResult | null;
  imageTimeMs: number;

  // Response generation
  responseText: string;
  streamingStarted: boolean;

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
  generatedImage?: GeneratedImageResult | null;
  metadata: {
    intent: SearchIntent;
    searchCount: number;
    totalTimeMs: number;
    classificationTimeMs: number;
    searchTimeMs: number;
    rerankTimeMs?: number;
    searchedCollections?: string[];
    appliedFilters?: SubcategoryFilters | null;
    imageTimeMs?: number;
    memoryRetrieveTimeMs?: number;
    responseTimeMs: number;
  };
  error?: string;
}

/**
 * Classification result from the classifier node.
 */
export interface ClassificationResult {
  intent: SearchIntent;
  searchSources?: SearchSource[];
  searchQuery: string | null;
  subQueries?: string[] | null;
  filters?: SubcategoryFilters | null;
  reasoning: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
}
