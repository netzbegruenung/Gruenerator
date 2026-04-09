import type { AIRequestData, AIWorkerResult } from '../types.js';

export interface ProviderAdapter {
  execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult>;
}

export interface ResponseMetadata {
  provider: string;
  model?: string | undefined;
  timestamp: string;
  requestId?: string | undefined;
  messageId?: string | undefined;
  usage?: {
    prompt_tokens?: number | undefined;
    completion_tokens?: number | undefined;
    total_tokens?: number | undefined;
  };
  durationMs?: number | undefined;
  [key: string]: unknown;
}

export interface RequestMetadata {
  platforms?: string[] | undefined;
  privacyMode?: boolean | undefined;
  requiresPrivacy?: boolean | undefined;
  [key: string]: unknown;
}
