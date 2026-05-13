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
