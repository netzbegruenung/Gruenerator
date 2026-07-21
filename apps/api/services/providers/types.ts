// Shared types for provider system

export type ProviderName = 'litellm' | 'mistral' | 'regolo';

export type ModelName = string;

export interface ProviderOptions {
  provider?: ProviderName | undefined;
  model?: ModelName | undefined;
  explicitProvider?: ProviderName | undefined;
}

export interface RequestMetadata {
  [key: string]: unknown;
}

export interface ProviderResult {
  provider: ProviderName;
  model: ModelName;
}

export interface FallbackProviderData {
  type?: string | undefined;
  options: ProviderOptions;
  [key: string]: unknown;
}

export type ProviderExecutor = (
  providerName: ProviderName,
  data: FallbackProviderData
) => Promise<ExecutionResponse>;

export interface ExecutionResponse {
  content?: unknown | undefined;
  stop_reason?: string | undefined;
  [key: string]: unknown;
}
