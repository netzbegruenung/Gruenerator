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

export interface AIWorkerResult {
  success: boolean;
  content?: string;
  error?: string;
  stop_reason?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  raw_content_blocks?: Array<{
    type: string;
    text?: string;
  }>;
}

export interface AIWorkerPool {
  processRequest(request: AIWorkerRequest): Promise<AIWorkerResult>;
  getStats(): {
    activeWorkers: number;
    queueLength: number;
    totalProcessed: number;
  };
}
