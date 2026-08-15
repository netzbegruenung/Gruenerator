/**
 * The request/response envelope of the in-process AI service
 * (`services/ai/aiService.ts`).
 *
 * The envelope shape is inherited: it used to travel over `postMessage` to a
 * `worker_threads` pool. That pool was replaced by an in-process service, its
 * message protocol, instance bookkeeping and config interfaces are gone, and
 * the names stopped saying "worker" with the 08/2026 rename — what is left here
 * is the payload shape the ~66 call sites and the provider adapters share.
 */

import type { ProviderName, ProviderOptions, RequestMetadata } from '../providers/types.js';

// ========================================
// AI Request/Response Types
// ========================================

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

export interface MessageContent {
  type: 'text' | 'image_url' | 'document_url';
  text?: string | undefined;
  image_url?: { url: string };
  document_url?: { url: string };
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ContentBlock {
  type: string;
  text?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  input?: Record<string, unknown> | undefined;
}

export interface FileMetadata {
  fileId?: string | undefined;
  usePromptCaching?: boolean | undefined;
}

export interface AIRequestOptions extends ProviderOptions {
  max_tokens?: number | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  tools?: Tool[] | undefined;
  tool_choice?: string | { type: string; name?: string };
  response_format?: { type: string };
  anthropic_version?: string | undefined;
  betas?: string[] | undefined;
  useDocumentQnA?: boolean | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
  [key: string]: unknown;
}

export interface AIRequestData {
  type: string;
  prompt?: string | undefined;
  systemPrompt?: string | undefined;
  messages?: Message[] | Array<{ role: string; content: unknown }> | undefined;
  options?: AIRequestOptions | undefined;
  metadata?: (RequestMetadata & Record<string, unknown>) | undefined;
  fileMetadata?: FileMetadata | undefined;
  instructions?: string | undefined;
  provider?: ProviderName | string | undefined;
  platforms?: string[] | undefined;
  documents?: DocumentReference[] | undefined;
  tools?: Tool[] | undefined;
  /** Eigene Zeitsperre für DIESEN Aufruf in ms; ohne Angabe gilt
   *  `env.REQUEST_TIMEOUT`. Für Aufrufe, die nachweislich länger brauchen als
   *  eine interaktive Antwort und deren Ausfall teurer ist als das Warten. */
  timeoutMs?: number | undefined;
  [key: string]: unknown;
}

export interface DocumentReference {
  url?: string | undefined;
  content?: string | undefined;
  type?: string | undefined;
  name?: string | undefined;
}

export interface AIResponseMetadata {
  provider: string;
  timestamp: string;
  backupRequested?: boolean | undefined;
  requestId?: string | undefined;
  messageId?: string | undefined;
  modelUsed?: string | undefined;
  workerIndex?: number | undefined;
  processedAt?: string | undefined;
  isFilesApiRequest?: boolean | undefined;
  fileId?: string | null | undefined;
  usedPromptCaching?: boolean | undefined;
  reasoningTokens?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  promptTokens?: number | undefined;
  totalTokens?: number | undefined;
  [key: string]: unknown;
}

export interface AiResult {
  content: string | null;
  stop_reason?: string | undefined;
  tool_calls?: ToolCall[] | undefined;
  raw_content_blocks?: ContentBlock[] | undefined;
  success: boolean;
  metadata?: AIResponseMetadata | undefined;
  error?: string | undefined;
  [key: string]: unknown;
}

// ========================================
// Service Interface
// ========================================

/**
 * The contract every consumer types against — `app.locals.aiClient` and the
 * ~15 test fakes. Import it from HERE, never from an implementation module
 * (see CLAUDE-routing.md).
 */
export interface AiClient {
  processRequest(data: AIRequestData, req?: unknown): Promise<AiResult>;
  shutdown(): Promise<void | PromiseSettledResult<number>[]>;
}

// Re-export provider types for convenience
export type { ProviderName, ProviderOptions, RequestMetadata } from '../providers/types.js';
