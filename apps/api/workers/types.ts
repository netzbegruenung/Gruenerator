import type { ProviderErrorInfo } from '../services/providers/providerErrors.js';
import type {
  ProviderName,
  ProviderOptions,
  RequestMetadata,
} from '../services/providers/types.js';
import type { Worker } from 'worker_threads';

// ========================================
// Worker Message Protocol Types
// ========================================

export interface WorkerRequestMessage {
  type: 'request';
  requestId: string;
  data: AIRequestData;
}

export interface WorkerResponseMessage {
  type: 'response';
  requestId: string;
  data: AIWorkerResult;
}

export interface WorkerErrorMessage {
  type: 'error';
  requestId: string;
  error: string;
  /** Classification survives the postMessage boundary; the pool rebuilds an AiProviderError from it. */
  errorInfo?: ProviderErrorInfo;
}

export interface WorkerProgressMessage {
  type: 'progress';
  requestId: string;
  progress: number;
}

export type WorkerMessage =
  | WorkerRequestMessage
  | WorkerResponseMessage
  | WorkerErrorMessage
  | WorkerProgressMessage;

export type WorkerIncomingMessage = WorkerRequestMessage;
export type WorkerOutgoingMessage =
  | WorkerResponseMessage
  | WorkerErrorMessage
  | WorkerProgressMessage;

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

export interface AIWorkerResult {
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
// Worker Pool Types
// ========================================

export interface WorkerInstance {
  instance: Worker;
  pendingRequests: Set<string>;
  status: 'ready' | 'busy' | 'error';
}

export interface PendingRequest {
  resolve: (value: AIWorkerResult) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  workerIndex: number;
  startTime: number;
}

export interface WorkerPoolStats {
  activeWorkers: number;
  queueLength: number;
  totalProcessed: number;
}

// ========================================
// Worker Configuration Types
// ========================================

export interface RateLimitConfig {
  maxRequests: number;
  timeWindow: number;
  maxConcurrent: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
  useBackupOnFail: boolean;
  backupRetryCount: number;
}

export interface MessagingConfig {
  progressUpdates: boolean;
  internalTimeout: number;
  validateResponses: boolean;
  debugLogging: boolean;
}

export interface DebugConfig {
  enabled: boolean;
  verbose: boolean;
  delayResponseMs: number;
}

export interface WorkerConfig {
  workersPerNode: number;
  requestTimeout: number;
  rateLimit: RateLimitConfig;
  retry: RetryConfig;
  messaging: MessagingConfig;
  debug: DebugConfig;
}

export interface LoggingConfig {
  level: string;
  aiRequests: boolean;
  performance: boolean;
  fullResponses: boolean;
}

export interface WorkerConfigRoot {
  worker: WorkerConfig;
  logging: LoggingConfig;
}

// ========================================
// Provider Adapter Types
// ========================================

export interface ProviderAdapter {
  execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult>;
}

export type ProviderAdapters = Record<ProviderName, ProviderAdapter>;

// ========================================
// Express Integration Types (re-export for convenience)
// ========================================

export interface AIWorkerPool {
  processRequest(data: AIRequestData, req?: unknown): Promise<AIWorkerResult>;
  shutdown(): Promise<void | PromiseSettledResult<number>[]>;
}

// Re-export provider types for convenience
export type {
  ProviderName,
  ProviderOptions,
  RequestMetadata,
} from '../services/providers/types.js';
