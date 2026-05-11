/**
 * Agent configuration types for the AI chat service
 */

/**
 * Tool restrictions allow per-agent customization of available search tools.
 * This enables country-specific agents (e.g., Austrian agent) to only access
 * relevant collections, enforced at the server level.
 */
export interface ToolRestrictions {
  /** Restrict gruenerator_search to specific collections */
  allowedCollections?: string[] | undefined;
  /** Default collection when not specified in query */
  defaultCollection?: string | undefined;
  /** Filter social media examples by country (DE = Germany, AT = Austria) */
  examplesCountry?: 'DE' | 'AT' | undefined;
  /**
   * Per-Landesverband scope for press/social examples. Accepts a single short
   * code (e.g. 'BE') or an array (e.g. ['BE', 'BE-F']) when the LV publishes
   * under multiple codes (Berlin & Thüringen carry both Landesverband and
   * Fraktion). Press filters via Qdrant `landesverband` field; social
   * currently logs only (Apify follow-up will add the field to social_media_examples).
   */
  examplesLvScope?: string | readonly string[] | undefined;
  /** Disable person search tool (e.g., no Austrian politician DB exists) */
  personSearchEnabled?: boolean | undefined;
}

/**
 * Hard-pinned filters merged into tool calls (Qdrant / examples service).
 * Invisible to the LLM — applied server-side in directSearchExecutors.
 */
export interface AgentDefaultFilter {
  /** Landesverband shortName(s), e.g. 'BE' or ['BE', 'BE-F']. */
  landesverband?: readonly string[] | string | undefined;
}

export interface FewShotExample {
  input: string;
  output: string;
  reasoning?: string | undefined;
}

export interface AgentConfig {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: string[];
  model: string;
  defaultModel?: string | undefined;
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo';
  params: {
    max_tokens: number;
    temperature: number;
  };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  plugins?: string[] | undefined;
  /** Tool restrictions for per-agent collection/country filtering */
  toolRestrictions?: ToolRestrictions | undefined;
  /** Whitelist of tool registry keys this agent can use. undefined = all tools. */
  enabledTools?: string[] | undefined;
  /** Few-shot examples injected into the system prompt to guide output quality */
  fewShotExamples?: FewShotExample[] | undefined;
  /** Runtime-only: set by controller, not by agent YAML files */
  userId?: string | undefined;
  /** Backend dispatch target. 'search' routes turns to /api/search-graph/stream. */
  routeTo?: 'chat' | 'search' | undefined;
  /** Server-side default filter merged into tool calls (e.g. LV scoping). */
  defaultFilter?: AgentDefaultFilter | undefined;
}

export interface Thread {
  id: string;
  user_id: string;
  agent_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  created_at: Date;
}

export interface ThreadWithLastMessage extends Thread {
  lastMessage?: {
    content: string;
    role: string;
    created_at: Date;
  } | null;
}
