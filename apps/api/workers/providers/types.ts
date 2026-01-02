import type { AIRequestData, AIWorkerResult } from '../types.js';

export interface ProviderAdapter {
  execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult>;
}

export interface ResponseMetadata {
  provider: string;
  model?: string;
  timestamp: string;
  requestId?: string;
  messageId?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  durationMs?: number;
  [key: string]: unknown;
}

export interface RequestMetadata {
  platforms?: string[];
  privacyMode?: boolean;
  requiresPrivacy?: boolean;
  [key: string]: unknown;
}
