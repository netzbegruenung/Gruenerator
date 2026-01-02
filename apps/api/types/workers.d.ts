// Re-export all worker types from the workers/types.ts module
// This file is kept for backwards compatibility with existing imports

export type {
  AIWorkerResult,
  AIRequestData,
  AIRequestOptions,
  AIResponseMetadata,
  AIWorkerPool,
  WorkerMessage,
  WorkerRequestMessage,
  WorkerResponseMessage,
  WorkerErrorMessage,
  WorkerProgressMessage,
  WorkerInstance,
  PendingRequest,
  WorkerPoolStats,
  WorkerConfig,
  WorkerConfigRoot,
  Message,
  MessageContent,
  Tool,
  ToolCall,
  ContentBlock,
  FileMetadata,
  DocumentReference,
  ProviderAdapter,
  ProviderAdapters,
  RateLimitConfig,
  RetryConfig,
  MessagingConfig,
  DebugConfig,
  LoggingConfig,
} from '../workers/types.js';

// Legacy interface names for backwards compatibility
export interface AIWorkerRequest {
  type: string;
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  systemPrompt?: string;
  options?: {
    max_tokens?: number;
    temperature?: number;
    useBedrock?: boolean;
    anthropic_version?: string;
    tools?: Array<{
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }>;
  };
}
