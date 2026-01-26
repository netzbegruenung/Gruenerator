import type { Worker } from 'worker_threads';
import type {
  ProviderName,
  ProviderOptions,
  RequestMetadata,
} from '../services/providers/types.js';

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
  content: string | MessageContent[];
}

export interface MessageContent {
  type: 'text' | 'image_url' | 'document_url';
  text?: string;
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
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface FileMetadata {
  fileId?: string;
  usePromptCaching?: boolean;
}

export interface AIRequestOptions extends ProviderOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: Tool[];
  tool_choice?: string | { type: string; name?: string };
  response_format?: { type: string };
  anthropic_version?: string;
  betas?: string[];
  useDocumentQnA?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  [key: string]: unknown;
}

export interface AIRequestData {
  type: string;
  prompt?: string;
  systemPrompt?: string;
  messages?: Message[];
  options?: AIRequestOptions;
  metadata?: RequestMetadata & Record<string, unknown>;
  fileMetadata?: FileMetadata;
  instructions?: string;
  provider?: ProviderName | string;
  usePrivacyMode?: boolean;
  platforms?: string[];
  documents?: DocumentReference[];
  tools?: Tool[];
}

export interface DocumentReference {
  url?: string;
  content?: string;
  type?: string;
  name?: string;
}

export interface AIResponseMetadata {
  provider: string;
  timestamp: string;
  backupRequested?: boolean;
  requestId?: string;
  messageId?: string;
  modelUsed?: string;
  workerIndex?: number;
  processedAt?: string;
  isFilesApiRequest?: boolean;
  fileId?: string | null;
  usedPromptCaching?: boolean;
  reasoningTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
  [key: string]: unknown;
}

export interface AIWorkerResult {
  content: string | null;
  stop_reason?: string;
  tool_calls?: ToolCall[];
  raw_content_blocks?: ContentBlock[];
  success: boolean;
  metadata?: AIResponseMetadata;
  error?: string;
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
  shutdown(): Promise<void[]>;
}

// Re-export provider types for convenience
export type {
  ProviderName,
  ProviderOptions,
  RequestMetadata,
} from '../services/providers/types.js';
