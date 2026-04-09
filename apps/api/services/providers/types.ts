// Shared types for provider system

export type ProviderName = 'ionos' | 'litellm' | 'mistral' | 'regolo';

export type ModelName = string;

export interface ProviderOptions {
  provider?: ProviderName;
  model?: ModelName;
  useUltraMode?: boolean;
  useProMode?: boolean;
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
}

export interface PrivacyProviderData {
  options: ProviderOptions;
  [key: string]: unknown;
}

export type ProviderExecutor = (
  providerName: ProviderName,
  data: PrivacyProviderData
) => Promise<ExecutionResponse>;

export interface ExecutionResponse {
  content?: unknown;
  stop_reason?: string;
  [key: string]: unknown;
}
