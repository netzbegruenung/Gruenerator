/**
 * Type definitions for chat agents
 * Defines interfaces for intent classification, parameter extraction, and context management
 */

/**
 * Configuration for a specific agent type
 */
export interface AgentMapping {
  /** Route identifier for the agent (e.g., 'social', 'sharepic', 'antrag') */
  route: string;
  /** Keywords that trigger this agent */
  keywords: string[];
  /** Human-readable description of what this agent does */
  description: string;
  /** Default parameters for this agent */
  params: Record<string, unknown>;
}

/**
 * Collection of all available agent mappings
 */
export type AgentMappings = Record<string, AgentMapping>;

/**
 * Represents a single detected intent in a user message
 */
export interface Intent {
  /** Agent identifier (e.g., 'twitter', 'zitat', 'antrag') */
  agent: string;
  /** Route to use for this intent */
  route: string;
  /** Parameters specific to this intent */
  params: Record<string, unknown>;
  /** Confidence score (0-1) for this intent classification */
  confidence: number;
}

/**
 * Result of intent classification
 */
export interface ClassificationResult {
  /** Whether multiple intents were detected in the message */
  isMultiIntent: boolean;
  /** Array of detected intents (1+ intents) */
  intents: Intent[];
  /** Method used for classification */
  method: 'ai' | 'keyword' | 'context' | 'fallback';
  /** Overall confidence score */
  confidence?: number;
  /** Type of request (conversation, content creation, or document query) */
  requestType?: 'conversation' | 'document_query' | 'content_creation';
  /** Sub-intent for conversation requests */
  subIntent?: 'summarize' | 'translate' | 'compare' | 'explain' | 'brainstorm' | 'general';
}

/**
 * Context from the chat conversation
 */
export interface ChatContext {
  /** Recent message history for context */
  messageHistory?: Array<{ role: string; content: string }>;
  /** Whether an image is attached to the current message */
  hasImageAttachment?: boolean;
  /** Last agent used in the conversation */
  lastAgent?: string;
  /** Current topic of conversation */
  topic?: string;
}

/**
 * AI Worker Pool interface for processing AI requests
 */
export interface AIWorkerPool {
  processRequest(request: AIWorkerRequest): Promise<AIWorkerResponse>;
}

/**
 * Request to AI worker pool
 */
export interface AIWorkerRequest {
  /** Type of AI request */
  type: string;
  /** System prompt for the AI */
  systemPrompt: string;
  /** Conversation messages */
  messages: Array<{ role: string; content: string }>;
  /** Additional options for the AI request */
  options?: {
    max_tokens?: number;
    temperature?: number;
    [key: string]: unknown;
  };
}

/**
 * Response from AI worker pool
 */
export interface AIWorkerResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Content returned from the AI */
  content: string;
  /** Error message if failed */
  error?: string;
}

/**
 * AI classification response format (after enrichment with routes)
 */
export interface AIClassificationResponse {
  /** Type of request */
  requestType: 'conversation' | 'document_query' | 'content_creation';
  /** Sub-intent for conversation requests */
  subIntent?: 'summarize' | 'translate' | 'compare' | 'explain' | 'brainstorm' | 'general';
  /** Detected intents (fully enriched with routes and params) */
  intents: Intent[];
}

/**
 * Keyword match result
 */
export interface KeywordMatch {
  /** Matched agent name */
  agent: string;
  /** Agent mapping configuration */
  mapping: AgentMapping;
  /** Keyword that matched */
  keyword: string;
  /** Length of the keyword (for sorting specificity) */
  length: number;
}

/**
 * Context-based classification result
 */
export interface ContextClassification {
  /** Agent identifier */
  agent: string;
  /** Route to use */
  route: string;
  /** Parameters for the agent */
  params: Record<string, unknown>;
  /** Confidence score */
  confidence: number;
}
