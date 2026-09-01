/**
 * Agent configuration types for the AI chat service.
 *
 * `ToolRestrictions` is now sourced from `@gruenerator/shared/agents` so the
 * API and the shared package can't drift. Re-exported here so existing
 * `import { ToolRestrictions } from '.../routes/chat/agents/types'` callers
 * keep compiling without touching their import paths.
 */
import type { ToolRestrictions } from '@gruenerator/shared/agents';
export type { ToolRestrictions } from '@gruenerator/shared/agents';

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
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo' | 'greenpt' | 'cortecs';
  params: {
    max_tokens: number;
    temperature: number;
  };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  plugins?: string[] | undefined;
  /**
   * Notebooks bound to this agent as its combined default knowledge base.
   * Resolved server-side from the loaded agent record (ChatGraph) and unioned
   * into `defaultNotebookCollectionIds` / `defaultNotebookDocumentIds`.
   */
  defaultNotebookIds?: readonly string[] | undefined;
  /** Tool restrictions for per-agent collection/country filtering */
  toolRestrictions?: ToolRestrictions | undefined;
  /** Whitelist of tool registry keys this agent can use. undefined = all tools. */
  enabledTools?: string[] | undefined;
  /** Fire the example search on every content-creation turn (classifierNode). */
  alwaysSearchesExamples?: boolean | undefined;
  /** Few-shot examples injected into the system prompt to guide output quality */
  fewShotExamples?: FewShotExample[] | undefined;
  /** Runtime-only: set by controller, not by agent YAML files */
  userId?: string | undefined;
  /**
   * Runtime-only, gesetzt in `agentLoader.getAgentForUser`: der Agent kommt
   * aus `user_agents` (eigener oder in ein Projekt geteilter), nicht aus der
   * Registry. Das Werkzeug `user_agents` montiert darauf — ein Thread mit
   * einem eigenen Agenten soll „ändere deine Rolle" ohne Stichwort verstehen.
   * Kein anderes Feld unterscheidet die beiden: `userId` trägt jede Config.
   */
  isUserAgent?: boolean | undefined;
  /** Backend dispatch target. 'search' routes turns to /api/search-graph/stream. */
  routeTo?: 'chat' | 'search' | undefined;
  /** Server-side default filter merged into tool calls (e.g. LV scoping). */
  defaultFilter?: AgentDefaultFilter | undefined;
  /**
   * When true, inject source URLs of search hits into the model's text context
   * so the agent can write concrete article links inline (e.g. ready-to-send
   * emails). Read by the ChatGraph respond node. Default off.
   */
  inlineSourceLinks?: boolean | undefined;
  /**
   * Recipe mention the single-pass respond path auto-loads when the user picked
   * none — the agent's core text form. See `Agent.defaultRecipeMention`.
   */
  defaultRecipeMention?: string | undefined;
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
