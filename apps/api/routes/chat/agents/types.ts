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
  allowedCollections?: string[];
  /** Default collection when not specified in query */
  defaultCollection?: string;
  /** Filter social media examples by country (DE = Germany, AT = Austria) */
  examplesCountry?: 'DE' | 'AT';
  /** Disable person search tool (e.g., no Austrian politician DB exists) */
  personSearchEnabled?: boolean;
}

export interface FewShotExample {
  input: string;
  output: string;
  reasoning?: string;
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
  defaultModel?: string;
  provider: 'mistral' | 'anthropic' | 'litellm';
  params: {
    max_tokens: number;
    temperature: number;
  };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  plugins?: string[];
  /** Tool restrictions for per-agent collection/country filtering */
  toolRestrictions?: ToolRestrictions;
  /** Whitelist of tool registry keys this agent can use. undefined = all tools. */
  enabledTools?: string[];
  /** Few-shot examples injected into the system prompt to guide output quality */
  fewShotExamples?: FewShotExample[];
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
