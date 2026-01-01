// Shared types for provider system

export type ProviderName = 'ionos' | 'litellm' | 'mistral' | 'claude' | 'bedrock' | 'openai';

export type ModelName = string;

export interface ProviderOptions {
  provider?: ProviderName;
  model?: ModelName;
  useUltraMode?: boolean;
  useProMode?: boolean;
  useBedrock?: boolean;
  privacyMode?: boolean;
  disableExternalProviders?: boolean;
  explicitProvider?: ProviderName;
}

export interface RequestMetadata {
  privacyMode?: boolean;
  requiresPrivacy?: boolean;
}

export interface ProviderResult {
  provider: ProviderName;
  model: ModelName;
  useBedrock?: boolean;
}

export interface PrivacyProviderData {
  options: ProviderOptions;
  [key: string]: any;
}

export type ProviderExecutor = (
  providerName: ProviderName,
  data: PrivacyProviderData
) => Promise<any>;

export interface ExecutionResponse {
  content?: any;
  stop_reason?: string;
  [key: string]: any;
}
