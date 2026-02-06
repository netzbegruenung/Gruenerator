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

import type { ModelMessage } from 'ai';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';

/**
 * Intent classification for routing to appropriate search tools.
 * The classifier determines which intent applies, and the graph routes accordingly.
 */
export type SearchIntent =
  | 'research' // Complex multi-source research ("recherchiere", "finde heraus")
  | 'search' // Gruenerator document search (party programs, positions)
  | 'person' // Person search ("Wer ist...", Green politicians)
  | 'web' // Web search (current events, external facts)
  | 'examples' // Social media examples/templates
  | 'direct'; // No search needed (greetings, creative tasks without fact needs)

/**
 * Unified search result structure from any tool.
 */
export interface SearchResult {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance?: number;
}

/**
 * Citation structure for response attribution.
 */
export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
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

  // Classification output
  intent: SearchIntent;
  searchQuery: string | null;
  reasoning: string;

  // Search results (accumulated)
  searchResults: SearchResult[];
  citations: Citation[];
  searchCount: number;
  maxSearches: number;

  // Response generation
  responseText: string;
  streamingStarted: boolean;

  // Metadata for observability
  startTime: number;
  classificationTimeMs: number;
  searchTimeMs: number;
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
  metadata: {
    intent: SearchIntent;
    searchCount: number;
    totalTimeMs: number;
    classificationTimeMs: number;
    searchTimeMs: number;
    responseTimeMs: number;
  };
  error?: string;
}

/**
 * Classification result from the classifier node.
 */
export interface ClassificationResult {
  intent: SearchIntent;
  searchQuery: string | null;
  reasoning: string;
}
