// Shared types for provider system

export type ProviderName = 'litellm' | 'mistral' | 'regolo';

export type ModelName = string;

export interface ProviderOptions {
  provider?: ProviderName | undefined;
  model?: ModelName | undefined;
  useUltraMode?: boolean | undefined;
  useProMode?: boolean | undefined;
  privacyMode?: boolean | undefined;
  disableExternalProviders?: boolean | undefined;
  explicitProvider?: ProviderName | undefined;
}

export interface RequestMetadata {
  privacyMode?: boolean | undefined;
  requiresPrivacy?: boolean | undefined;
}

export interface ProviderResult {
  provider: ProviderName;
  model: ModelName;
}

export interface PrivacyProviderData {
  type?: string | undefined;
  options: ProviderOptions;
  [key: string]: unknown;
}

export type ProviderExecutor = (
  providerName: ProviderName,
  data: PrivacyProviderData
) => Promise<ExecutionResponse>;

export interface ExecutionResponse {
  content?: unknown | undefined;
  stop_reason?: string | undefined;
  [key: string]: unknown;
}
