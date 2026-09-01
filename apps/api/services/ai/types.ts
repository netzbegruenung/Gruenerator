/**
 * Die Nutzlast, die `services/ai/generate.ts` und die Provider-Adapter teilen.
 *
 * Die Form ist geerbt: sie reiste einmal per `postMessage` zu einem
 * `worker_threads`-Pool. Der Pool wurde zu einem Dienst im Prozess, der Dienst
 * zur typisierten Fassade — geblieben ist diese Nutzlast, weil
 * `executeProvider` sie nimmt.
 *
 * Was hier NICHT mehr steht, seit die letzte der 62 Aufrufstellen umgezogen
 * ist: `AiClient`, der Vertrag mit `processRequest`. Es gibt keinen zweiten Weg
 * zum Modell mehr und entsprechend nichts, wogegen ein Aufrufer typisieren
 * müsste — `aiText`/`aiObject`/`aiTools` sind die Schnittstelle.
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
  /**
   * Die Frist DIESES Anbieterversuchs in ms — `execute.ts` macht daraus das
   * `abortSignal` des Aufrufs.
   *
   * Nicht die Frist des Aufrufers: die heisst `AiCall.timeoutMs`
   * (`services/ai/generate.ts`), deckt die ganze Ausweichkette und wird von
   * `attemptBudget` auf die Anbieter aufgeteilt. Wer hier von Hand einen Wert
   * setzt, umgeht diese Aufteilung.
   *
   * Bis zum 28.08.2026 stand hier die Beschreibung der Aufrufer-Frist, und das
   * Feld wurde von niemandem gelesen — der aufgegebene Anbieteraufruf lief
   * weiter und wurde zu Ende bezahlt.
   */
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

// Re-export provider types for convenience
export type { ProviderName, ProviderOptions, RequestMetadata } from '../providers/types.js';
